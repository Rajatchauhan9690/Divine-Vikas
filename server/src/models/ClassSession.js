import mongoose from "mongoose";

const seatSchema = new mongoose.Schema(
  {
    seatNumber: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["available", "pending_payment", "booked"],
      default: "available",
      required: true,
    },
    bookedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    bookedAt: { type: Date, default: null },
    holdExpiresAt: { type: Date, default: null },
    paymentOrderId: { type: String, default: "" },
    paymentSessionId: { type: String, default: "" },
    paymentId: { type: String, default: "" },
    slotStartsAt: { type: Date, default: null },
    emailNotification: {
      status: {
        type: String,
        enum: ["not_requested", "sending", "sent", "failed"],
        default: "not_requested",
      },
      error: { type: String, default: "" },
      sentAt: Date,
    },
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
    bookingType: {
      type: String,
      enum: ["class", "time_slots"],
      default: "class",
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    price: { type: Number, min: 0, max: 1000000, default: 0 },
    startsAt: { type: Date, required: true },
    durationMinutes: { type: Number, min: 1, max: 600, default: 60 },
    seats: { type: [seatSchema], validate: (v) => v.length > 0 },
  },
  { timestamps: true },
);

classSessionSchema.index({ startsAt: 1 });
classSessionSchema.index({ "seats.seatNumber": 1 });
export default mongoose.model("ClassSession", classSessionSchema);
