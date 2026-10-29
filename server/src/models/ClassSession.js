import mongoose from "mongoose";

const seatSchema = new mongoose.Schema(
  {
    seatNumber: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["available", "booked"],
      default: "available",
      required: true,
    },
    bookedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    bookedAt: { type: Date, default: null },
  },
  { _id: false },
);

const classSessionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    instructorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    startsAt: { type: Date, required: true },
    durationMinutes: { type: Number, min: 1, max: 600, default: 60 },
    seats: { type: [seatSchema], validate: (v) => v.length > 0 },
  },
  { timestamps: true },
);

classSessionSchema.index({ startsAt: 1 });
classSessionSchema.index({ "seats.seatNumber": 1 });
export default mongoose.model("ClassSession", classSessionSchema);
