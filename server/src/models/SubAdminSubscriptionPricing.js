import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    amount: { type: Number, required: true, min: 1, max: 1000000 },
    description: { type: String, required: true, maxlength: 180 },
    serviceLimit: { type: Number, required: true, min: 1, max: 1000 },
    sessionLimit: { type: Number, required: true, min: 1, max: 100000 },
    durationMonths: { type: Number, enum: [1, 3, 12], required: true },
    intervalType: {
      type: String,
      enum: ["MONTH", "YEAR"],
      default: "MONTH",
      required: true,
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.index({ active: 1, amount: 1 });

export default mongoose.model("SubAdminSubscriptionPricing", schema);