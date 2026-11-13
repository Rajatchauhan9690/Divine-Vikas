import mongoose from "mongoose";

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
        shippingWeightKg: { type: Number, min: 0.001, max: 100, default: null },
        shippingLengthCm: { type: Number, min: 0.1, max: 1000, default: null },
        shippingBreadthCm: { type: Number, min: 0.1, max: 1000, default: null },
        shippingHeightCm: { type: Number, min: 0.1, max: 1000, default: null },
        returnable: { type: Boolean, default: true },
        returnWindowDays: { type: Number, min: 1, max: 90, default: null },
      },
    ],
    subtotal: { type: Number, min: 0, default: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    coupon: {
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", default: null },
      code: { type: String, default: "" },
      discountType: { type: String, enum: ["percent", "fixed", null], default: null },
      value: { type: Number, default: null },
      reservationStatus: {
        type: String,
        enum: ["none", "reserved", "releasing", "released", "redeeming", "redeemed"],
        default: "none",
      },
    },
    shippingCost: { type: Number, min: 0, default: 0 },
    shippingCourier: {
      id: { type: Number, default: 0 },
      name: { type: String, default: "" },
      estimatedDays: { type: String, default: "" },
    },
    total: { type: Number, required: true, min: 0 },
    shippingAddress: { type: mongoose.Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "releasing",
        "expired",
        "failed",
        "order_created",
        "refund_required",
      ],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    providerOrderId: { type: String, required: true, unique: true },
    paymentSessionId: { type: String, default: "" },
    cfPaymentId: { type: String, default: "" },
    expiresAt: { type: Date, required: true, index: true },
    inventoryReleasedAt: { type: Date, default: null },
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
  },
  { timestamps: true },
);

export default mongoose.model("ProductPaymentAttempt", schema);
