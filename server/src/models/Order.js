import mongoose from "mongoose";
const addressSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true, maxlength: 40, default: "Home" },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    line1: { type: String, required: true, trim: true, maxlength: 180 },
    line2: { type: String, trim: true, maxlength: 180, default: "" },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    postalCode: { type: String, required: true, trim: true, maxlength: 12 },
    country: { type: String, required: true, trim: true, default: "India" },
    landmark: { type: String, trim: true, maxlength: 100, default: "" },
  },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: String,
        price: Number,
        quantity: { type: Number, min: 1, required: true },
        returnable: { type: Boolean, default: true },
        returnWindowDays: { type: Number, min: 1, max: 90, default: null },
      },
    ],
    total: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: [
        "pending",
        "paid",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    shippingAddress: { type: addressSchema, required: true },
    paymentMethod: { type: String, enum: ["cashfree", "cod"], default: "cashfree" },
    paymentStatus: {
      type: String,
      enum: ["not_required", "pending", "paid", "failed", "refunded"],
      default: "not_required",
    },
    payment: {
      providerOrderId: String,
      paymentSessionId: String,
      cfPaymentId: String,
      paidAt: Date,
    },
    refund: {
      status: {
        type: String,
        enum: ["not_requested", "processing", "pending", "success", "failed"],
        default: "not_requested",
      },
      reason: { type: String, default: "" },
      refundId: { type: String, default: "" },
      idempotencyKey: { type: String, default: "" },
      providerRefundId: { type: String, default: "" },
      note: { type: String, default: "" },
      updatedAt: Date,
    },
    returnRequest: {
      status: {
        type: String,
        enum: [
          "none",
          "requested",
          "approved",
          "rejected",
          "refund_pending",
          "refund_failed",
          "refunded",
        ],
        default: "none",
      },
      reason: { type: String, default: "" },
      requestedAt: Date,
      reviewedAt: Date,
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      receivedAt: Date,
    },
    deliveredAt: { type: Date, default: null },
    shipping: {
      shiprocketOrderId: { type: String, default: "" },
      shipmentId: { type: String, default: "" },
      labelUrl: { type: String, default: "" },
      package: {
        weight: Number,
        length: Number,
        breadth: Number,
        height: Number,
      },
    },
    whatsapp: {
      status: {
        type: String,
        enum: ["not_requested", "sending", "sent", "failed"],
        default: "not_requested",
      },
      messageId: { type: String, default: "" },
      error: { type: String, default: "" },
      sentAt: Date,
    },
    tracking: {
      courier: String,
      trackingNumber: String,
      trackingUrl: String,
    },
    statusHistory: [
      {
        status: {
          type: String,
          enum: [
            "pending",
            "paid",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
          ],
        },
        note: { type: String, default: "" },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
    ],
    cancellationProcessing: { type: Boolean, default: false },
    cancellationProcessingAt: { type: Date, default: null },
    inventoryReleasedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
schema.index({ "payment.providerOrderId": 1 }, { sparse: true });
export default mongoose.model("Order", schema);
