import crypto from "node:crypto";
import SubAdminSubscriptionPayment from "../models/SubAdminSubscriptionPayment.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cashfreeEnvironment } from "../services/cashfreeService.js";
import {
  processManualSubscriptionWebhook,
  processRecurringSubscriptionWebhook,
  startManualRenewal,
  verifySubscriptionAttempt,
} from "../services/subAdminSubscriptionService.js";

export const getCurrentSubAdminSubscription = asyncHandler(
  async (req, res) => {
    const payment = await SubAdminSubscriptionPayment.findOne({
      user: req.user._id,
      status: "pending",
      expiresAt: { $gt: new Date() },
    })
      .select("amount paymentSessionId expiresAt")
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      success: true,
      subscription: req.user.subscription,
      pendingPayment: payment
        ? {
            attemptId: payment._id,
            amount: payment.amount,
            expiresAt: payment.expiresAt,
            payment: {
              provider: "cashfree",
              paymentSessionId: payment.paymentSessionId,
              environment: cashfreeEnvironment(),
              expiresAt: payment.expiresAt,
              returnUrl: `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/admin/subscription?attempt=${payment._id}&payment=return`,
            },
          }
        : null,
    });
  },
);

export const createSubAdminRenewal = asyncHandler(async (req, res) => {
  const checkout = await startManualRenewal(req.user);
  res.status(201).json({ success: true, ...checkout });
});

export const verifySubAdminRenewal = asyncHandler(async (req, res) => {
  const attempt = await SubAdminSubscriptionPayment.findOne({
    _id: req.params.attemptId,
    user: req.user._id,
  });
  if (!attempt)
    throw new AppError("Renewal payment not found", 404, "ATTEMPT_NOT_FOUND");
  if (attempt.billingMode !== "manual")
    throw new AppError("This renewal is not a manual payment", 400, "INVALID_RENEWAL");
  const result = await verifySubscriptionAttempt(attempt._id);
  res.json({
    success: true,
    status: result.status,
    subscription: result.user?.subscription || req.user.subscription,
  });
});

export const subAdminSubscriptionWebhook = asyncHandler(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const signature = req.headers["x-webhook-signature"];
  const timestamp = req.headers["x-webhook-timestamp"];
  if (!signature || !timestamp || !process.env.CASHFREE_CLIENT_SECRET)
    throw new AppError("Invalid webhook signature", 401, "INVALID_WEBHOOK");
  const expected = crypto
    .createHmac("sha256", process.env.CASHFREE_CLIENT_SECRET)
    .update(String(timestamp) + raw.toString("utf8"))
    .digest("base64");
  const received = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(expected);
  if (
    received.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(received, expectedBuffer)
  )
    throw new AppError("Invalid webhook signature", 401, "INVALID_WEBHOOK");
  const event = JSON.parse(raw.toString("utf8"));
  const payment = event.data?.payment || {};
  const manualHandled = await processManualSubscriptionWebhook({
    providerOrderId: event.data?.order?.order_id,
    paymentStatus: payment.payment_status,
    paymentId: String(payment.cf_payment_id || ""),
    paymentAmount: payment.payment_amount,
  });
  const handled =
    manualHandled || (await processRecurringSubscriptionWebhook(event));
  res.json({ success: true, ignored: !handled });
});