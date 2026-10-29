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
    paymentMethod: { type: String, enum: ["cashfree", "cod"], default: "cod" },
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
    tracking: { courier: String, trackingNumber: String, trackingUrl: String },
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
    addressChangeAllowed: { type: Boolean, default: true },
  },
  { timestamps: true },
);
schema.index({ "payment.providerOrderId": 1 }, { sparse: true });
export default mongoose.model("Order", schema);
