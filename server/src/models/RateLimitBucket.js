import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    resetAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("RateLimitBucket", schema);
