import mongoose from "mongoose";
import ClassSession from "../models/ClassSession.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const listClassSessions = asyncHandler(async (_req, res) => {
  const sessions = await ClassSession.find({ startsAt: { $gte: new Date() } })
    .select("title description instructorName startsAt durationMinutes seats")
    .sort({ startsAt: 1 })
    .lean();
  res.json({ success: true, sessions });
});

export const createClassSession = asyncHandler(async (req, res) => {
  const {
    title,
    description = "",
    instructorName,
    startsAt,
    durationMinutes = 60,
    seatCount = 20,
  } = req.body;
  if (
    !title?.trim() ||
    !instructorName?.trim() ||
    !startsAt ||
    !Number.isInteger(seatCount) ||
    seatCount < 1 ||
    seatCount > 200 ||
    !Number.isFinite(Date.parse(startsAt)) ||
    Date.parse(startsAt) <= Date.now()
  ) {
    throw new AppError(
      "Provide a title, instructor, future start time, and seatCount from 1 to 200",
      400,
      "INVALID_CLASS_SESSION",
    );
  }
  const seats = Array.from({ length: seatCount }, (_, i) => ({
    seatNumber: `S${String(i + 1).padStart(2, "0")}`,
    status: "available",
  }));
  const session = await ClassSession.create({
    title: title.trim(),
    description,
    instructorName: instructorName.trim(),
    startsAt: new Date(startsAt),
    durationMinutes,
    seats,
  });
  res.status(201).json({ success: true, session });
});

export const bookClassSeat = asyncHandler(async (req, res) => {
  const { classId, seatNumber } = req.params;
  if (!mongoose.isValidObjectId(classId))
    throw new AppError("Invalid class session ID", 400, "INVALID_CLASS_ID");
  const normalizedSeat = seatNumber.trim().toUpperCase();

  // One atomic MongoDB operation: only a seat that is still available can transition to booked.
  const session = await ClassSession.findOneAndUpdate(
    {
      _id: classId,
      startsAt: { $gt: new Date() },
      seats: {
        $elemMatch: { seatNumber: normalizedSeat, status: "available" },
      },
    },
    {
      $set: {
        "seats.$.status": "booked",
        "seats.$.bookedBy": req.user._id,
        "seats.$.bookedAt": new Date(),
      },
    },
    { new: true, runValidators: true },
  ).select("title startsAt seats");

  if (!session) {
    const exists = await ClassSession.exists({ _id: classId });
    if (!exists)
      throw new AppError("Class session not found", 404, "CLASS_NOT_FOUND");
    throw new AppError(
      "This seat is no longer available, or the class has already started",
      409,
      "SEAT_UNAVAILABLE",
    );
  }
  const bookedSeat = session.seats.find(
    (seat) => seat.seatNumber === normalizedSeat,
  );
  res.status(201).json({
    success: true,
    message: "Seat booked successfully",
    booking: {
      classId: session._id,
      classTitle: session.title,
      startsAt: session.startsAt,
      seatNumber: bookedSeat.seatNumber,
      status: bookedSeat.status,
    },
  });
});

export const myClassBookings = asyncHandler(async (req, res) => {
  const sessions = await ClassSession.find({ "seats.bookedBy": req.user._id })
    .select("title instructorName startsAt durationMinutes seats")
    .sort({ startsAt: 1 })
    .lean();
  const bookings = sessions.flatMap((session) =>
    session.seats
      .filter((seat) => String(seat.bookedBy) === String(req.user._id))
      .map((seat) => ({
        classId: session._id,
        classTitle: session.title,
        instructorName: session.instructorName,
        startsAt: session.startsAt,
        durationMinutes: session.durationMinutes,
        seatNumber: seat.seatNumber,
        status: seat.status,
      })),
  );
  res.json({ success: true, bookings });
});
