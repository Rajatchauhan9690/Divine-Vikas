import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import SubAdminInvitation from "../models/SubAdminInvitation.js";
import SubAdminSubscriptionPayment from "../models/SubAdminSubscriptionPayment.js";
import SubAdminSubscriptionPricing from "../models/SubAdminSubscriptionPricing.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hashToken } from "../utils/tokens.js";
import { issueSession } from "../services/authService.js";
import { sendSubAdminInvitationEmail } from "../services/emailService.js";
import {
  cancelInvitationSubscriptionAttempt,
  listSubscriptionPlans,
  startInvitationCheckout,
  verifySubscriptionAttempt,
} from "../services/subAdminSubscriptionService.js";
import { cashfreeEnvironment } from "../services/cashfreeService.js";

const invitationDurationMs = 24 * 60 * 60 * 1000;

export const listSubAdminInvitations = asyncHandler(async (_req, res) => {
  const [invitations, subAdmins] = await Promise.all([
    SubAdminInvitation.find({
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select("email name expiresAt createdAt")
      .sort({ createdAt: -1 })
      .lean(),
    User.find({ role: "sub_admin" })
      .select("name email active createdAt subscription")
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  res.json({ success: true, invitations, subAdmins });
});

export const getAdminSubAdminSubscriptionPlans = asyncHandler(
  async (_req, res) => {
    const plans = await listSubscriptionPlans();
    res.json({ success: true, plans });
  },
);

export const updateAdminSubAdminSubscriptionPlans = asyncHandler(
  async (req, res) => {
    const plans = req.body?.plans;
    const planTerms = [
      { key: "monthly", name: "Monthly", durationMonths: 1, intervalType: "MONTH" },
      { key: "quarterly", name: "Quarterly", durationMonths: 3, intervalType: "MONTH" },
      { key: "yearly", name: "Yearly", durationMonths: 12, intervalType: "YEAR" },
    ];
    if (
      !Array.isArray(plans) ||
      plans.length !== planTerms.length ||
      planTerms.some((term) => !plans.some((plan) => plan?.key === term.key))
    )
      throw new AppError("Provide monthly, quarterly, and yearly plan settings", 400, "INVALID_PLANS");

    const normalized = planTerms.map((term) => {
      const plan = plans.find((item) => item.key === term.key);
      const amount = Number(plan?.amount);
      const serviceLimit = Number(plan?.serviceLimit);
      const sessionLimit = Number(plan?.sessionLimit);
      if (
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > 1000000 ||
        !Number.isInteger(serviceLimit) ||
        serviceLimit < 1 ||
        serviceLimit > 1000 ||
        !Number.isInteger(sessionLimit) ||
        sessionLimit < 1 ||
        sessionLimit > 100000
      )
        throw new AppError(
          `Enter valid price, service limit, and session limit for the ${term.name.toLowerCase()} plan`,
          400,
          "INVALID_PLAN",
        );
      return {
        ...term,
        amount,
        serviceLimit,
        sessionLimit,
        description:
          term.durationMonths === 1
            ? "Billed monthly"
            : `Billed every ${term.durationMonths} months`,
        active: true,
      };
    });

    await SubAdminSubscriptionPricing.bulkWrite(
      normalized.map((plan) => ({
        updateOne: {
          filter: { key: plan.key },
          update: { $set: plan },
          upsert: true,
        },
      })),
    );
    res.json({ success: true, plans: await listSubscriptionPlans() });
  },
);

export const createSubAdminInvitation = asyncHandler(async (req, res) => {
  const email =
    typeof req.body.email === "string" ? req.body.email.toLowerCase().trim() : "";
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    name.length > 80
  )
    throw new AppError(
      "Provide a valid email address and a name of at most 80 characters",
      400,
      "INVALID_INVITATION",
    );
  if (await User.exists({ email }))
    throw new AppError(
      "An account with this email already exists",
      409,
      "EMAIL_EXISTS",
    );

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + invitationDurationMs);
  const invitation = await SubAdminInvitation.findOneAndUpdate(
    { email, consumedAt: null },
    {
      $set: {
        name,
        invitedBy: req.user._id,
        tokenHash,
        expiresAt,
        signupAttempt: null,
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  const link = `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/sub-admin-invitation?token=${encodeURIComponent(token)}`;
  try {
    await sendSubAdminInvitationEmail({ email, name, link });
  } catch (error) {
    await SubAdminInvitation.deleteOne({ _id: invitation._id, tokenHash });
    throw error;
  }
  res.status(201).json({
    success: true,
    invitation: { email, name, expiresAt },
  });
});

export const inspectSubAdminInvitation = asyncHandler(async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token))
    throw new AppError("Invitation is invalid or expired", 400, "INVALID_INVITATION");
  const invitation = await SubAdminInvitation.findOne({
    tokenHash: hashToken(token),
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).select("email name expiresAt");
  if (!invitation)
    throw new AppError("Invitation is invalid or expired", 400, "INVALID_INVITATION");
  res.json({ success: true, invitation });
});

export const inspectSubAdminSubscriptionAttempt = asyncHandler(
  async (req, res) => {
    const token =
      typeof req.query.token === "string" ? req.query.token : "";
    const attemptId =
      typeof req.query.attemptId === "string" ? req.query.attemptId : "";
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token))
      throw new AppError("Invitation is invalid or expired", 400, "INVALID_INVITATION");
    if (attemptId && !/^[a-f\d]{24}$/i.test(attemptId))
      throw new AppError("Invalid payment attempt", 400, "INVALID_ATTEMPT");
    const invitationTokenHash = hashToken(token);
    await SubAdminSubscriptionPayment.updateMany(
      {
        invitationTokenHash,
        status: "pending",
        expiresAt: { $lte: new Date() },
      },
      { $set: { status: "expired", passwordHash: "" } },
    );
    const attemptQuery = attemptId
      ? { _id: attemptId, invitationTokenHash }
      : {
          invitationTokenHash,
          status: "pending",
          expiresAt: { $gt: new Date() },
        };
    const attempt = await SubAdminSubscriptionPayment.findOne(attemptQuery)
      .select(
        "name phone planKey planName amount billingMode status expiresAt paymentSessionId serviceLimit sessionLimit durationMonths",
      )
      .select("+authorizationUrl")
      .sort({ createdAt: -1 })
      .lean();
    if (!attempt && attemptId)
      throw new AppError("Payment attempt not found", 404, "ATTEMPT_NOT_FOUND");
    if (!attempt)
      return res.json({ success: true, attempt: null });
    res.json({
      success: true,
      attempt: {
        ...attempt,
        paymentUrl: attempt.authorizationUrl,
        environment: cashfreeEnvironment(),
        returnUrl: `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/sub-admin-invitation?token=${encodeURIComponent(token)}&attempt=${attempt._id}&payment=return`,
      },
    });
  },
);

export const getSubAdminSubscriptionPlans = asyncHandler(async (_req, res) => {
  const plans = await listSubscriptionPlans();
  res.json({ success: true, plans });
});

export const createSubAdminSubscriptionCheckout = asyncHandler(
  async (req, res) => {
    const { token, name, password, phone, planKey, billingMode } = req.body;
    if (
      typeof token !== "string" ||
      !/^[A-Za-z0-9_-]{40,50}$/.test(token) ||
      typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 80 ||
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 72 ||
      typeof phone !== "string" ||
      !/^\+?[1-9]\d{9,14}$/.test(phone.replace(/[\s()-]/g, "")) ||
      typeof planKey !== "string" ||
      !["manual", "autopay"].includes(billingMode)
    )
      throw new AppError(
        "Enter valid account details, choose a plan and payment method",
        400,
        "INVALID_INPUT",
      );

    const invitation = await SubAdminInvitation.findOne({
      tokenHash: hashToken(token),
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!invitation)
      throw new AppError("Invitation is invalid or expired", 400, "INVALID_INVITATION");
    const passwordHash = await bcrypt.hash(password, 12);
    const checkout = await startInvitationCheckout({
      invitation,
      name: name.trim(),
      phone: phone.replace(/[\s()-]/g, ""),
      passwordHash,
      planKey,
      billingMode,
      token,
    });
    res.status(201).json({ success: true, ...checkout });
  },
);

export const verifySubAdminInvitationCheckout = asyncHandler(
  async (req, res) => {
    const token = typeof req.body.token === "string" ? req.body.token : "";
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token))
      throw new AppError("Invalid invitation", 400, "INVALID_INVITATION");
    const attempt = await SubAdminSubscriptionPayment.findOne({
      _id: req.body.attemptId,
      invitationTokenHash: hashToken(token),
    });
    if (!attempt)
      throw new AppError("Payment attempt not found", 404, "ATTEMPT_NOT_FOUND");
    const result = await verifySubscriptionAttempt(attempt._id);
    if (result.status !== "paid")
      return res.json({ success: true, status: result.status });
    const session = await issueSession(result.user, req, res);
    res.json({ success: true, status: "paid", ...session });
  },
);

export const cancelSubAdminInvitationCheckout = asyncHandler(
  async (req, res) => {
    const token = typeof req.body.token === "string" ? req.body.token : "";
    if (!/^[A-Za-z0-9_-]{40,50}$/.test(token))
      throw new AppError("Invalid invitation", 400, "INVALID_INVITATION");
    const attempt = await SubAdminSubscriptionPayment.findOne({
      _id: req.body.attemptId,
      invitationTokenHash: hashToken(token),
    });
    if (!attempt)
      throw new AppError("Payment attempt not found", 404, "ATTEMPT_NOT_FOUND");
    const result = await cancelInvitationSubscriptionAttempt(attempt);
    if (result.status !== "paid")
      return res.json({ success: true, status: result.status });
    const session = await issueSession(result.user, req, res);
    res.json({ success: true, status: "paid", ...session });
  },
);
