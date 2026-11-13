import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 30,
    },
    description: { type: String, trim: true, maxlength: 160, default: "" },
    discountType: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 0.01 },
    maxDiscountAmount: { type: Number, min: 0, default: null },
    minimumOrderAmount: { type: Number, min: 0, default: 0 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    usageLimit: { type: Number, min: 0, default: 0 },
    reservedCount: { type: Number, min: 0, default: 0 },
    redeemedCount: { type: Number, min: 0, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.index({ active: 1, code: 1 });

export default mongoose.model("Coupon", schema);
