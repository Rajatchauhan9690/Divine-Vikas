import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    invitation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubAdminInvitation",
      default: null,
    },
    invitationTokenHash: { type: String, default: "", select: false },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    passwordHash: { type: String, default: "", select: false },
    planKey: { type: String, required: true },
    planName: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    serviceLimit: { type: Number, required: true, min: 1 },
    sessionLimit: { type: Number, default: 100, min: 1 },
    durationMonths: { type: Number, default: 1, enum: [1, 3, 12] },
    billingMode: {
      type: String,
      enum: ["manual", "autopay"],
      required: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "paid",
        "authorized",
        "failed",
        "cancelled",
        "expired",
        "refund_required",
      ],
      default: "pending",
      index: true,
    },
    providerOrderId: { type: String, default: null, unique: true, sparse: true },
    providerPaymentId: { type: String, default: "" },
    providerSubscriptionId: { type: String, default: "", index: true },
    providerSubscriptionSessionId: { type: String, default: "" },
    authorizationUrl: { type: String, default: "", select: false },
    paymentSessionId: { type: String, default: "" },
    expiresAt: { type: Date, required: true, index: true },
    paidAt: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    lastWebhookPaymentId: { type: String, default: "" },
    lastWebhookAt: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.index({ invitation: 1, status: 1 });
schema.index({ user: 1, status: 1, createdAt: -1 });
schema.index(
  { invitation: 1 },
  {
    unique: true,
    partialFilterExpression: {
      invitation: { $type: "objectId" },
      status: "pending",
    },
  },
);
schema.index(
  { user: 1 },
  {
    unique: true,
    partialFilterExpression: {
      user: { $type: "objectId" },
      status: "pending",
    },
  },
);

export default mongoose.model("SubAdminSubscriptionPayment", schema);