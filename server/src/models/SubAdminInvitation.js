import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, default: "", trim: true, maxlength: 80 },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    signupAttempt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubAdminSubscriptionPayment",
      default: null,
    },
  },
  { timestamps: true },
);

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
schema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { consumedAt: null } },
);

export default mongoose.model("SubAdminInvitation", schema);
