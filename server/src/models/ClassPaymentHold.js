import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    paymentOrderId: { type: String, required: true, unique: true },
    seatNumbers: { type: [String], required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("ClassPaymentHold", schema);
