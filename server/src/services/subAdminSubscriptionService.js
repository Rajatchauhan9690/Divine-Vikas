import crypto from "node:crypto";
import mongoose from "mongoose";
import SubAdminInvitation from "../models/SubAdminInvitation.js";
import SubAdminSubscriptionPayment from "../models/SubAdminSubscriptionPayment.js";
import SubAdminSubscriptionPricing from "../models/SubAdminSubscriptionPricing.js";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { cashfreeEnvironment, cashfreeRequest } from "./cashfreeService.js";

const cashfreeApiVersion = "2025-01-01";
const attemptDurationMs = 20 * 60 * 1000;
const autopayAttemptDurationMs = 48 * 60 * 60 * 1000;
const defaults = [
  {
    key: "monthly",
    name: "Monthly",
    amount: 499,
    description: "Billed monthly",
    serviceLimit: 5,
    sessionLimit: 100,
    durationMonths: 1,
    intervalType: "MONTH",
    active: true,
  },
  {
    key: "quarterly",
    name: "Quarterly",
    amount: 1299,
    description: "Billed every 3 months",
    serviceLimit: 15,
    sessionLimit: 500,
    durationMonths: 3,
    intervalType: "MONTH",
    active: true,
  },
  {
    key: "yearly",
    name: "Yearly",
    amount: 4999,
    description: "Billed every 12 months",
    serviceLimit: 50,
    sessionLimit: 2000,
    durationMonths: 12,
    intervalType: "YEAR",
    active: true,
  },
];

export async function listSubscriptionPlans() {
  await Promise.all(
    defaults.map((plan) =>
      SubAdminSubscriptionPricing.updateOne(
        { key: plan.key },
        { $setOnInsert: plan },
        { upsert: true },
      ),
    ),
  );
  return SubAdminSubscriptionPricing.find({
    key: { $in: defaults.map((plan) => plan.key) },
    active: true,
  })
    .select(
      "key name amount description serviceLimit sessionLimit durationMonths intervalType",
    )
    .sort({ durationMonths: 1 })
    .lean();
}

function getClientOrigin() {
  return process.env.CLIENT_ORIGIN || "http://localhost:5173";
}

function accountPeriodEnd(from = new Date(), durationMonths = 1) {
  const end = new Date(from);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + durationMonths);
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end;
}

async function createSubscriptionUser(attempt) {
  let user = await User.findOne({
    email: attempt.email,
    role: "sub_admin",
  });
  if (user) {
    if (user.subscription?.paymentAttemptId?.toString() !== attempt._id.toString())
      throw new AppError(
        "An account with this email already exists",
        409,
        "EMAIL_EXISTS",
      );
  } else {
    const invitation = await SubAdminInvitation.findById(attempt.invitation);
    if (
      !invitation ||
      invitation.tokenHash !== attempt.invitationTokenHash ||
      (attempt.expiresAt <= new Date() &&
        !attempt.lastWebhookPaymentId &&
        !["paid", "authorized"].includes(attempt.status)) ||
      (invitation.consumedAt &&
        invitation.signupAttempt?.toString() !== attempt._id.toString()) ||
      (invitation.signupAttempt &&
        invitation.signupAttempt.toString() !== attempt._id.toString())
    )
      throw new AppError(
        "Invitation is invalid or expired",
        400,
        "INVALID_INVITATION",
      );

    await SubAdminInvitation.updateOne(
      { _id: invitation._id, consumedAt: null, signupAttempt: null },
      { $set: { signupAttempt: attempt._id } },
    );
    const currentInvitation = await SubAdminInvitation.findById(invitation._id);
    if (currentInvitation?.signupAttempt?.toString() !== attempt._id.toString())
      throw new AppError(
        "This invitation has already been used",
        409,
        "INVITATION_ALREADY_USED",
      );
    if (!attempt.passwordHash)
      throw new AppError(
        "Signup details have expired. Request a new invitation.",
        400,
        "SIGNUP_DETAILS_EXPIRED",
      );

    try {
      user = await User.createWithPasswordHash({
        name: attempt.name,
        email: attempt.email,
        phone: attempt.phone,
        password: attempt.passwordHash,
        role: "sub_admin",
        subscription: {
          planKey: attempt.planKey,
          planName: attempt.planName,
          amount: attempt.amount,
          serviceLimit: attempt.serviceLimit,
          sessionLimit: attempt.sessionLimit || 100,
          durationMonths: attempt.durationMonths || 1,
          billingMode: attempt.billingMode,
          status: "active",
          currentPeriodEnd:
            attempt.currentPeriodEnd ||
            accountPeriodEnd(new Date(), attempt.durationMonths || 1),
          providerSubscriptionId: attempt.providerSubscriptionId,
          paymentAttemptId: attempt._id,
          lastPaymentId:
            attempt.providerPaymentId || attempt.lastWebhookPaymentId,
        },
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      user = await User.findOne({
        email: attempt.email,
        role: "sub_admin",
      });
      if (user?.subscription?.paymentAttemptId?.toString() !== attempt._id.toString())
        throw new AppError(
          "An account with this email already exists",
          409,
          "EMAIL_EXISTS",
        );
    }

    await SubAdminInvitation.updateOne(
      { _id: invitation._id, signupAttempt: attempt._id, consumedAt: null },
      { $set: { consumedAt: new Date() } },
    );
  }

  attempt.user = user._id;
  attempt.passwordHash = "";
  await attempt.save();
  return user;
}

async function activatePaidManualAttempt(attempt, paymentId) {
  if (attempt.status === "paid" && attempt.user) {
    const existing = await User.findById(attempt.user);
    if (
      existing &&
      existing.subscription.currentPeriodEnd < attempt.currentPeriodEnd
    ) {
      existing.subscription.status = "active";
      existing.subscription.currentPeriodEnd = attempt.currentPeriodEnd;
      existing.subscription.lastPaymentId = attempt.providerPaymentId;
      existing.subscription.paymentAttemptId = attempt._id;
      await existing.save();
    }
    return { user: existing, status: "paid" };
  }
  const now = new Date();
  const previousPeriodEnd = attempt.user
    ? (await User.findById(attempt.user))?.subscription?.currentPeriodEnd
    : null;
  attempt.status = "paid";
  attempt.paidAt = now;
  attempt.providerPaymentId = String(paymentId || "");
  attempt.currentPeriodEnd = accountPeriodEnd(
    new Date(Math.max(now.getTime(), previousPeriodEnd?.getTime() || 0)),
    attempt.durationMonths || 1,
  );
  await attempt.save();

  if (attempt.user) {
    const user = await User.findById(attempt.user);
    if (!user || user.role !== "sub_admin")
      throw new AppError("Subscription account not found", 404, "ACCOUNT_NOT_FOUND");
    user.subscription.status = "active";
    user.subscription.currentPeriodEnd = attempt.currentPeriodEnd;
    user.subscription.lastPaymentId = attempt.providerPaymentId;
    user.subscription.paymentAttemptId = attempt._id;
    await user.save();
    return { user, status: "paid" };
  }
  const user = await createSubscriptionUser(attempt);
  return { user, status: "paid" };
}

export async function startInvitationCheckout({
  invitation,
  name,
  phone,
  passwordHash,
  planKey,
  billingMode,
  token,
}) {
  await listSubscriptionPlans();
  const plan = await SubAdminSubscriptionPricing.findOne({
    active: true,
    key: planKey,
  }).select(
    "key name amount serviceLimit sessionLimit durationMonths intervalType",
  );
  if (!plan)
    throw new AppError("Choose an available subscription plan", 400, "INVALID_PLAN");

  const now = new Date();
  await SubAdminSubscriptionPayment.updateMany(
    {
      invitation: invitation._id,
      status: "pending",
      invitationTokenHash: { $ne: invitation.tokenHash },
    },
    { $set: { status: "cancelled", passwordHash: "" } },
  );
  await SubAdminSubscriptionPayment.updateMany(
    { invitation: invitation._id, status: "pending", expiresAt: { $lte: now } },
    { $set: { status: "expired", passwordHash: "" } },
  );
  const existingAttempt = await SubAdminSubscriptionPayment.findOne({
    invitation: invitation._id,
    invitationTokenHash: invitation.tokenHash,
    status: "pending",
    expiresAt: { $gt: now },
  })
    .select(
    "name phone planKey planName amount serviceLimit sessionLimit durationMonths billingMode expiresAt paymentSessionId",
    )
    .select("+authorizationUrl")
    .sort({ createdAt: -1 });
  if (existingAttempt) {
    const existingPayment =
      existingAttempt.billingMode === "manual"
        ? existingAttempt.paymentSessionId
        : existingAttempt.authorizationUrl;
    if (!existingPayment)
      throw new AppError(
        "Your checkout is still being prepared. Please try again in a few seconds.",
        409,
        "CHECKOUT_INITIALIZING",
      );
    return {
      attemptId: existingAttempt._id,
      billingMode: existingAttempt.billingMode,
      amount: existingAttempt.amount,
      name: existingAttempt.name,
      phone: existingAttempt.phone,
      planKey: existingAttempt.planKey,
      planName: existingAttempt.planName,
      serviceLimit: existingAttempt.serviceLimit,
      sessionLimit: existingAttempt.sessionLimit || 100,
      durationMonths: existingAttempt.durationMonths || 1,
      reused: true,
      ...(existingAttempt.billingMode === "manual" &&
      existingAttempt.paymentSessionId
        ? {
            payment: {
              provider: "cashfree",
              paymentSessionId: existingAttempt.paymentSessionId,
              environment: cashfreeEnvironment(),
              expiresAt: existingAttempt.expiresAt,
              returnUrl: `${getClientOrigin()}/sub-admin-invitation?token=${encodeURIComponent(token)}&attempt=${existingAttempt._id}&payment=return`,
            },
          }
        : existingAttempt.authorizationUrl
          ? { paymentUrl: existingAttempt.authorizationUrl }
          : {}),
    };
  }

  const expiresAt = new Date(
    now.getTime() +
      (billingMode === "autopay"
        ? autopayAttemptDurationMs
        : attemptDurationMs),
  );
  let attempt;
  try {
    attempt = await SubAdminSubscriptionPayment.create({
      invitation: invitation._id,
      invitationTokenHash: invitation.tokenHash,
      email: invitation.email,
      name,
      phone,
      passwordHash,
      planKey: plan.key,
      planName: plan.name,
      amount: plan.amount,
      serviceLimit: plan.serviceLimit,
      sessionLimit: plan.sessionLimit,
      durationMonths: plan.durationMonths,
      billingMode,
      expiresAt,
    });
  } catch (error) {
    if (error.code === 11000) {
      const activeAttempt = await SubAdminSubscriptionPayment.findOne({
        invitation: invitation._id,
        invitationTokenHash: invitation.tokenHash,
        status: "pending",
        expiresAt: { $gt: new Date() },
      })
        .select(
          "name phone planKey planName amount serviceLimit sessionLimit durationMonths billingMode expiresAt paymentSessionId",
        )
        .select("+authorizationUrl")
        .sort({ createdAt: -1 });
      if (activeAttempt?.billingMode === "manual" && activeAttempt.paymentSessionId)
        return {
          attemptId: activeAttempt._id,
          billingMode: "manual",
          amount: activeAttempt.amount,
          name: activeAttempt.name,
          phone: activeAttempt.phone,
          planKey: activeAttempt.planKey,
          planName: activeAttempt.planName,
          serviceLimit: activeAttempt.serviceLimit,
          sessionLimit: activeAttempt.sessionLimit || 100,
          durationMonths: activeAttempt.durationMonths || 1,
          reused: true,
          payment: {
            provider: "cashfree",
            paymentSessionId: activeAttempt.paymentSessionId,
            environment: cashfreeEnvironment(),
            expiresAt: activeAttempt.expiresAt,
            returnUrl: `${getClientOrigin()}/sub-admin-invitation?token=${encodeURIComponent(token)}&attempt=${activeAttempt._id}&payment=return`,
          },
        };
      if (activeAttempt?.authorizationUrl)
        return {
          attemptId: activeAttempt._id,
          billingMode: "autopay",
          amount: activeAttempt.amount,
          name: activeAttempt.name,
          phone: activeAttempt.phone,
          planKey: activeAttempt.planKey,
          planName: activeAttempt.planName,
          serviceLimit: activeAttempt.serviceLimit,
          sessionLimit: activeAttempt.sessionLimit || 100,
          durationMonths: activeAttempt.durationMonths || 1,
          paymentUrl: activeAttempt.authorizationUrl,
          reused: true,
        };
      throw new AppError(
        "Your checkout is still being prepared. Please try again in a few seconds.",
        409,
        "CHECKOUT_INITIALIZING",
      );
    }
    throw error;
  }
  const attemptReturnUrl = `${getClientOrigin()}/sub-admin-invitation?token=${encodeURIComponent(token)}&attempt=${attempt._id}&payment=return`;

  if (billingMode === "manual") {
    attempt.providerOrderId = `DVSA${crypto.randomBytes(16).toString("hex")}`;
    await attempt.save();
    try {
      const response = await cashfreeRequest("/orders", {
        body: {
          order_id: attempt.providerOrderId,
          order_amount: plan.amount,
          order_currency: "INR",
          order_expiry_time: expiresAt.toISOString(),
          customer_details: {
            customer_id: `subadmin_${attempt._id}`,
            customer_name: name,
            customer_email: invitation.email,
            customer_phone: phone.replace(/\D/g, "").slice(-10),
          },
          order_meta: {
            return_url: attemptReturnUrl,
            notify_url:
              process.env.CASHFREE_SUBSCRIPTION_WEBHOOK_URL ||
              process.env.CASHFREE_WEBHOOK_URL,
          },
        },
      });
      attempt.paymentSessionId = response.payment_session_id;
      await attempt.save();
      return {
        attemptId: attempt._id,
        billingMode,
        amount: attempt.amount,
        planKey: attempt.planKey,
        planName: attempt.planName,
        serviceLimit: attempt.serviceLimit,
        sessionLimit: attempt.sessionLimit,
        durationMonths: attempt.durationMonths,
        payment: {
          provider: "cashfree",
          paymentSessionId: response.payment_session_id,
          environment: cashfreeEnvironment(),
          expiresAt,
          returnUrl: attemptReturnUrl,
        },
      };
    } catch (error) {
      await SubAdminSubscriptionPayment.deleteOne({ _id: attempt._id });
      throw error;
    }
  }

  try {
    const providerSubscriptionId = `DVSA_${crypto.randomUUID().replaceAll("-", "")}`;
    attempt.providerSubscriptionId = providerSubscriptionId;
    await attempt.save();
    const subscriptionResponse = await cashfreeRequest("/subscriptions", {
      apiVersion: cashfreeApiVersion,
      body: {
        subscription_id: providerSubscriptionId,
        customer_details: {
          customer_name: name,
          customer_email: invitation.email,
          customer_phone: phone.replace(/\D/g, "").slice(-10),
        },
        plan_details: {
          plan_name: plan.name,
          plan_type: "PERIODIC",
          plan_amount: plan.amount,
          plan_currency: "INR",
          plan_max_cycles: 1200,
          plan_intervals:
            plan.intervalType === "YEAR" ? 1 : plan.durationMonths,
          plan_interval_type: plan.intervalType,
        },
        authorization_details: {
          authorization_amount: 1,
          authorization_amount_refund: true,
          payment_methods: ["upi"],
        },
        subscription_first_charge_time: new Date(
          Date.now() + 15 * 60 * 1000,
        ).toISOString(),
        subscription_expiry_time: new Date(
          Date.now() + 10 * 365 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        subscription_meta: { return_url: attemptReturnUrl },
      },
    });
    const subscriptionData = subscriptionResponse.data || subscriptionResponse;
    if (!subscriptionData.subscription_session_id)
      throw new AppError(
        "Cashfree did not return a subscription session",
        502,
        "CASHFREE_SESSION_MISSING",
      );
    attempt.providerSubscriptionSessionId =
      subscriptionData.subscription_session_id;
    await attempt.save();
    const payment = await cashfreeRequest("/subscriptions/pay", {
      apiVersion: cashfreeApiVersion,
      body: {
        subscription_id: providerSubscriptionId,
        subscription_session_id:
          subscriptionData.subscription_session_id,
        payment_id: `AUTH_${crypto.randomUUID().replaceAll("-", "")}`,
        payment_type: "AUTH",
        payment_method: { upi: { channel: "link" } },
      },
    });
    const paymentData = payment.data || payment;
    const paymentUrl =
      paymentData.data?.url ||
      paymentData.payment_link ||
      paymentData.url ||
      paymentData.action_url ||
      paymentData.authorization_url;
    if (!paymentUrl)
      throw new AppError(
        "Cashfree did not return a mandate authorization link",
        502,
        "CASHFREE_SESSION_MISSING",
      );
    attempt.providerSubscriptionSessionId = String(
      paymentData.subscription_session_id ||
        paymentData.payment_session_id ||
        "",
    );
    attempt.paymentSessionId = String(paymentData.payment_session_id || "");
    attempt.authorizationUrl = paymentUrl;
    await attempt.save();
    return {
      attemptId: attempt._id,
      billingMode,
      amount: attempt.amount,
      planKey: attempt.planKey,
      planName: attempt.planName,
      serviceLimit: attempt.serviceLimit,
      sessionLimit: attempt.sessionLimit,
      durationMonths: attempt.durationMonths,
      paymentUrl,
      expiresAt,
    };
  } catch (error) {
    await SubAdminSubscriptionPayment.deleteOne({ _id: attempt._id });
    throw error;
  }
}

export async function verifySubscriptionAttempt(attemptId) {
  if (!mongoose.isValidObjectId(attemptId))
    throw new AppError("Invalid payment attempt", 400, "INVALID_ATTEMPT");
  const attempt = await SubAdminSubscriptionPayment.findById(attemptId).select(
    "+passwordHash +invitationTokenHash +authorizationUrl",
  );
  if (!attempt)
    throw new AppError("Payment attempt not found", 404, "ATTEMPT_NOT_FOUND");
  if (
    ["failed", "cancelled", "expired", "refund_required"].includes(attempt.status)
  )
    return { status: attempt.status };
  if (attempt.status === "paid" && attempt.user) {
    const user = await User.findById(attempt.user);
    if (attempt.billingMode === "manual")
      return activatePaidManualAttempt(attempt, attempt.providerPaymentId);
    return { status: "paid", user };
  }
  if (attempt.status === "authorized" && attempt.user)
    return { status: "paid", user: await User.findById(attempt.user) };
  if (attempt.expiresAt <= new Date() && attempt.status === "pending") {
    attempt.status = "expired";
    attempt.passwordHash = "";
    await attempt.save();
    return { status: "expired" };
  }

  if (attempt.billingMode === "manual") {
    const response = await cashfreeRequest(
      `/orders/${encodeURIComponent(attempt.providerOrderId)}/payments`,
      { method: "GET" },
    );
    const payments = Array.isArray(response) ? response : response.data || [];
    const successfulPayment = payments.find(
      (payment) => payment.payment_status === "SUCCESS",
    );
    if (!successfulPayment) {
      const failed = payments.some((payment) =>
        ["FAILED", "USER_DROPPED", "CANCELLED", "VOID"].includes(
          payment.payment_status,
        ),
      );
      if (failed && attempt.status === "pending") {
        attempt.status = "failed";
        attempt.passwordHash = "";
        await attempt.save();
        return { status: "failed" };
      }
      return { status: "pending" };
    }
    if (Number(successfulPayment.payment_amount) !== Number(attempt.amount)) {
      attempt.status = "refund_required";
      attempt.passwordHash = "";
      await attempt.save();
      throw new AppError(
        "Cashfree confirmed an unexpected payment amount. Contact support.",
        409,
        "PAYMENT_AMOUNT_MISMATCH",
      );
    }
    return activatePaidManualAttempt(attempt, successfulPayment.cf_payment_id);
  }

  const response = await cashfreeRequest(
    `/subscriptions/${encodeURIComponent(attempt.providerSubscriptionId)}`,
    { method: "GET", apiVersion: cashfreeApiVersion },
  );
  const subscription = response.data || response;
  const status = String(
    subscription.subscription_status || subscription.status || "",
  ).toUpperCase();
  if (
    (status === "ACTIVE" || status === "BANK_APPROVED") &&
    attempt.lastWebhookPaymentId
  ) {
    attempt.status = "authorized";
    attempt.paidAt = attempt.paidAt || new Date();
    await attempt.save();
    const user = await createSubscriptionUser(attempt);
    return { status: "paid", user };
  }
  if (status === "ACTIVE" || status === "BANK_APPROVED")
    return { status: "pending" };
  if (["CANCELLED", "EXPIRED", "FAILED", "COMPLETED"].includes(status)) {
    attempt.status = status === "EXPIRED" ? "expired" : "failed";
    attempt.passwordHash = "";
    await attempt.save();
    return { status: attempt.status };
  }
  return { status: "pending" };
}

export async function cancelInvitationSubscriptionAttempt(attempt) {
  const verified = await verifySubscriptionAttempt(attempt._id);
  if (verified.status === "paid")
    return { status: "paid", user: verified.user };
  if (verified.status !== "pending")
    return { status: verified.status };

  if (attempt.billingMode === "autopay") {
    await cashfreeRequest(
      `/subscriptions/${encodeURIComponent(attempt.providerSubscriptionId)}/manage`,
      {
        apiVersion: cashfreeApiVersion,
        body: {
          subscription_id: attempt.providerSubscriptionId,
          action: "CANCEL",
        },
      },
    );
  }

  const cancelled = await SubAdminSubscriptionPayment.findOneAndUpdate(
    { _id: attempt._id, status: "pending" },
    { $set: { status: "cancelled", passwordHash: "", authorizationUrl: "" } },
    { new: true },
  );
  if (!cancelled) {
    const latest = await SubAdminSubscriptionPayment.findById(attempt._id)
      .select("status user")
      .lean();
    if (latest?.status === "paid" && latest.user)
      return {
        status: "paid",
        user: await User.findById(latest.user),
      };
    return { status: latest?.status || "cancelled" };
  }
  return { status: "cancelled" };
}

export async function startManualRenewal(user) {
  if (user.role !== "sub_admin" || user.subscription?.billingMode !== "manual")
    throw new AppError(
      "Manual renewal is not available for this subscription",
      400,
      "RENEWAL_UNAVAILABLE",
    );
  const now = new Date();
  await SubAdminSubscriptionPayment.updateMany(
    { user: user._id, status: "pending", expiresAt: { $lte: now } },
    { $set: { status: "expired" } },
  );
  const pendingAttempt = await SubAdminSubscriptionPayment.findOne({
      user: user._id,
      status: "pending",
      expiresAt: { $gt: now },
    }).sort({ createdAt: -1 });
  if (pendingAttempt)
    return {
      attemptId: pendingAttempt._id,
      billingMode: "manual",
      amount: pendingAttempt.amount,
      payment: {
        provider: "cashfree",
        paymentSessionId: pendingAttempt.paymentSessionId,
        environment: cashfreeEnvironment(),
        expiresAt: pendingAttempt.expiresAt,
        returnUrl: `${getClientOrigin()}/admin/subscription?attempt=${pendingAttempt._id}&payment=return`,
      },
    };
  const expiresAt = new Date(now.getTime() + attemptDurationMs);
  let attempt;
  try {
    attempt = await SubAdminSubscriptionPayment.create({
      user: user._id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      planKey: user.subscription.planKey,
      planName: user.subscription.planName,
      amount: user.subscription.amount,
      serviceLimit: user.subscription.serviceLimit,
      sessionLimit: user.subscription.sessionLimit || 100,
      durationMonths: user.subscription.durationMonths || 1,
      billingMode: "manual",
      expiresAt,
      providerOrderId: `DVSA${crypto.randomBytes(16).toString("hex")}`,
    });
  } catch (error) {
    if (error.code === 11000)
      throw new AppError(
        "A renewal checkout is already in progress",
        409,
        "CHECKOUT_IN_PROGRESS",
      );
    throw error;
  }
  const returnUrl = `${getClientOrigin()}/admin/subscription?attempt=${attempt._id}&payment=return`;
  try {
    const response = await cashfreeRequest("/orders", {
      body: {
        order_id: attempt.providerOrderId,
        order_amount: attempt.amount,
        order_currency: "INR",
        order_expiry_time: expiresAt.toISOString(),
        customer_details: {
          customer_id: user._id.toString(),
          customer_name: user.name,
          customer_email: user.email,
          customer_phone: user.phone.replace(/\D/g, "").slice(-10),
        },
        order_meta: {
          return_url: returnUrl,
          notify_url:
            process.env.CASHFREE_SUBSCRIPTION_WEBHOOK_URL ||
            process.env.CASHFREE_WEBHOOK_URL,
        },
      },
    });
    attempt.paymentSessionId = response.payment_session_id;
    await attempt.save();
    return {
      attemptId: attempt._id,
      billingMode: "manual",
      amount: attempt.amount,
      payment: {
        provider: "cashfree",
        paymentSessionId: response.payment_session_id,
        environment: cashfreeEnvironment(),
        expiresAt,
        returnUrl,
      },
    };
  } catch (error) {
    await SubAdminSubscriptionPayment.deleteOne({ _id: attempt._id });
    throw error;
  }
}

export async function processManualSubscriptionWebhook({
  providerOrderId,
  paymentStatus,
  paymentId,
  paymentAmount,
}) {
  if (!providerOrderId) return false;
  const attempt = await SubAdminSubscriptionPayment.findOne({
    providerOrderId,
    billingMode: "manual",
  });
  if (!attempt) return false;
  if (paymentStatus === "SUCCESS") {
    if (
      Number(paymentAmount) !== Number(attempt.amount) ||
      ["failed", "cancelled", "expired", "refund_required"].includes(
        attempt.status,
      ) ||
      (!attempt.user && !attempt.passwordHash)
    ) {
      attempt.status = "refund_required";
      attempt.providerPaymentId = String(paymentId || "");
      attempt.passwordHash = "";
      await attempt.save();
      return true;
    }
    await activatePaidManualAttempt(attempt, paymentId);
  } else if (
    ["FAILED", "USER_DROPPED", "CANCELLED", "VOID"].includes(paymentStatus) &&
    attempt.status === "pending"
  ) {
    attempt.status = "failed";
    attempt.passwordHash = "";
    await attempt.save();
  }
  return true;
}

export async function processRecurringSubscriptionWebhook(event) {
  const data = event.data || {};
  const providerSubscriptionId = String(
    data.subscription?.subscription_id ||
      data.subscription_details?.subscription_id ||
      data.payment?.subscription_id ||
      data.payment?.subscription_details?.subscription_id ||
      data.subscription_id ||
      "",
  );
  if (!providerSubscriptionId) return false;
  const attempt = await SubAdminSubscriptionPayment.findOne({
    providerSubscriptionId,
    billingMode: "autopay",
  })
    .select("+passwordHash +invitationTokenHash")
    .sort({ createdAt: -1 });
  if (!attempt) return false;
  const user = attempt.user && (await User.findById(attempt.user));

  const payment = data.payment || {};
  const paymentStatus = String(payment.payment_status || "").toUpperCase();
  const paymentId = String(payment.cf_payment_id || payment.payment_id || "");
  if (
    paymentStatus === "SUCCESS" &&
    Number(payment.payment_amount) === Number(attempt.amount) &&
    paymentId &&
    attempt.lastWebhookPaymentId !== paymentId
  ) {
    if (
      ["failed", "cancelled", "expired", "refund_required"].includes(
        attempt.status,
      ) ||
      (!user && !attempt.passwordHash)
    ) {
      attempt.status = "refund_required";
      attempt.providerPaymentId = paymentId;
      attempt.passwordHash = "";
      await attempt.save();
      return true;
    }
    const now = new Date();
    const previousPeriodEnd =
      user?.subscription.currentPeriodEnd || attempt.currentPeriodEnd;
    const currentPeriodEnd = accountPeriodEnd(
      new Date(
        Math.max(now.getTime(), previousPeriodEnd?.getTime() || 0),
      ),
      attempt.durationMonths || 1,
    );
    attempt.status = "authorized";
    attempt.paidAt = attempt.paidAt || now;
    attempt.currentPeriodEnd = currentPeriodEnd;
    attempt.lastWebhookPaymentId = paymentId;
    attempt.lastWebhookAt = now;
    await attempt.save();
    if (user) {
      user.subscription.status = "active";
      user.subscription.currentPeriodEnd = currentPeriodEnd;
      user.subscription.lastPaymentId = paymentId;
      await user.save();
    } else if (attempt.passwordHash) {
      await createSubscriptionUser(attempt);
    }
    return true;
  }
  if (["FAILED", "USER_DROPPED"].includes(paymentStatus)) {
    if (user) {
      user.subscription.status = "past_due";
      await user.save();
    }
    return true;
  }
  const subscriptionStatus = String(
    data.subscription?.subscription_status ||
      data.subscription_details?.subscription_status ||
      "",
  ).toUpperCase();
  if (["CANCELLED", "COMPLETED", "EXPIRED"].includes(subscriptionStatus)) {
    if (user) {
      user.subscription.status = "cancelled";
      await user.save();
    } else {
      attempt.status = "failed";
      attempt.passwordHash = "";
      await attempt.save();
    }
  }
  return true;
}

export { accountPeriodEnd };