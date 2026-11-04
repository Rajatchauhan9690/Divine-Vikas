import crypto from "node:crypto";
import mongoose from "mongoose";
import ClassSession from "../models/ClassSession.js";
import ClassPaymentHold from "../models/ClassPaymentHold.js";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  cashfreeEnvironment,
  cashfreeRequest,
} from "../services/cashfreeService.js";
import { notifyClassBookingConfirmation } from "../services/emailNotificationService.js";

const holdDurationMs = 20 * 60 * 1000;
const terminalPaymentStatuses = new Set([
  "NOT_ATTEMPTED",
  "FAILED",
  "USER_DROPPED",
  "CANCELLED",
  "VOID",
]);

function queueClassBookingConfirmationEmail(sessionId, paymentOrderId) {
  void notifyClassBookingConfirmation(sessionId, paymentOrderId).catch(
    (error) =>
      console.error("Could not process class booking confirmation email", {
        paymentOrderId,
        code: error.code || "EMAIL_SEND_FAILED",
      }),
  );
}

function validClassId(classId) {
  if (!mongoose.isValidObjectId(classId))
    throw new AppError("Invalid class session ID", 400, "INVALID_CLASS_ID");
}

async function releaseExpiredHolds() {
  const now = new Date();
  await ClassSession.updateMany(
    {
      seats: {
        $elemMatch: {
          status: "pending_payment",
          holdExpiresAt: { $lte: now },
        },
      },
    },
    {
      $set: {
        "seats.$[expired].status": "available",
        "seats.$[expired].bookedBy": null,
        "seats.$[expired].bookedAt": null,
        "seats.$[expired].holdExpiresAt": null,
        "seats.$[expired].paymentOrderId": "",
        "seats.$[expired].paymentSessionId": "",
        "seats.$[expired].paymentId": "",
      },
    },
    {
      arrayFilters: [
        {
          "expired.status": "pending_payment",
          "expired.holdExpiresAt": { $lte: now },
        },
      ],
    },
  );
}

async function completeSeatPayment({
  classId,
  paymentOrderId,
  paymentId,
  expectedSeatCount,
}) {
  const now = new Date();
  await ClassSession.updateOne(
    {
      _id: classId,
      $or: [
        {
          bookingType: { $in: ["class", null] },
          startsAt: { $gt: now },
        },
        {
          bookingType: "time_slots",
          seats: {
            $elemMatch: {
              paymentOrderId,
              slotStartsAt: { $gt: now },
            },
          },
        },
      ],
      $expr: {
        $eq: [
          {
            $size: {
              $filter: {
                input: "$seats",
                as: "seat",
                cond: {
                  $and: [
                    { $eq: ["$$seat.paymentOrderId", paymentOrderId] },
                    { $eq: ["$$seat.status", "pending_payment"] },
                    { $gt: ["$$seat.holdExpiresAt", now] },
                  ],
                },
              },
            },
          },
          expectedSeatCount,
        ],
      },
    },
    {
      $set: {
        "seats.$[held].status": "booked",
        "seats.$[held].bookedAt": now,
        "seats.$[held].holdExpiresAt": null,
        "seats.$[held].paymentId": paymentId || "",
      },
    },
    {
      arrayFilters: [
        { "held.paymentOrderId": paymentOrderId },
      ],
    },
  );
  const session = await ClassSession.findById(classId)
    .select("seats")
    .lean();
  const orderSeats =
    session?.seats.filter((seat) => seat.paymentOrderId === paymentOrderId) ||
    [];
  return {
    confirmed:
      orderSeats.length === expectedSeatCount &&
      orderSeats.every((seat) => seat.status === "booked"),
    seats: orderSeats,
  };
}

async function releaseFailedPayment(session, paymentOrderId) {
  const result = await ClassSession.updateOne(
    {
      _id: session._id,
      seats: {
        $elemMatch: {
          status: "pending_payment",
          paymentOrderId,
        },
      },
    },
    {
      $set: {
        "seats.$[held].status": "available",
        "seats.$[held].bookedBy": null,
        "seats.$[held].bookedAt": null,
        "seats.$[held].holdExpiresAt": null,
        "seats.$[held].paymentOrderId": "",
        "seats.$[held].paymentSessionId": "",
        "seats.$[held].paymentId": "",
      },
    },
    {
      arrayFilters: [{ "held.paymentOrderId": paymentOrderId }],
    },
  );
  return Boolean(result.modifiedCount);
}

async function acquireClassPaymentHold({
  accountId,
  classId,
  paymentOrderId,
  seatNumbers,
  expiresAt,
}) {
  const existing = await ClassPaymentHold.findOneAndUpdate(
    { accountId, expiresAt: { $lte: new Date() } },
    { $set: { classId, paymentOrderId, seatNumbers, expiresAt } },
    { new: true },
  );
  if (existing) return existing;
  try {
    return await ClassPaymentHold.create({
      accountId,
      classId,
      paymentOrderId,
      seatNumbers,
      expiresAt,
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    throw new AppError(
      "You already have a class payment in progress. Complete it or wait for the seat hold to expire.",
      409,
      "CLASS_PAYMENT_IN_PROGRESS",
    );
  }
}

async function releaseClassPaymentHold(accountId, paymentOrderId) {
  await ClassPaymentHold.deleteOne({ accountId, paymentOrderId });
}

export const listClassSessions = asyncHandler(async (_req, res) => {
  await releaseExpiredHolds();
  const sessions = await ClassSession.find({
    bookingType: { $in: ["class", null] },
    startsAt: { $gte: new Date() },
  })
    .select(
      "title description instructorName price startsAt durationMinutes seats",
    )
    .sort({ startsAt: 1 })
    .lean();
  res.json({
    success: true,
    sessions: sessions.map((session) => ({
      ...session,
      seats: session.seats.map(({ seatNumber, status }) => ({
        seatNumber,
        status,
      })),
    })),
  });
});

export const listAdminClassSessions = asyncHandler(async (req, res) => {
  await releaseExpiredHolds();
  const search = String(req.query.search || "").trim().slice(0, 100);
  const view = ["all", "past", "upcoming"].includes(req.query.view)
    ? req.query.view
    : "upcoming";
  const filter = { bookingType: { $in: ["class", null] } };
  const now = new Date();
  if (view === "past") filter.startsAt = { $lt: now };
  if (view === "upcoming") filter.startsAt = { $gte: now };
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = ["title", "instructorName", "description"].map((field) => ({
      [field]: { $regex: escapedSearch, $options: "i" },
    }));
  }
  const sessions = await ClassSession.find(filter)
    .select(
      "title description instructorName price startsAt durationMinutes seats",
    )
    .sort({ startsAt: view === "upcoming" ? 1 : -1 })
    .lean();
  res.json({
    success: true,
    sessions: sessions.map((session) => ({
      ...session,
      seats: session.seats.map(({ seatNumber, status }) => ({
        seatNumber,
        status,
      })),
    })),
  });
});

export const myClassPaymentHolds = asyncHandler(async (req, res) => {
  await releaseExpiredHolds();
  const sessions = await ClassSession.find({
    bookingType: { $in: ["class", null] },
    "seats.bookedBy": req.user._id,
    "seats.status": "pending_payment",
    "seats.holdExpiresAt": { $gt: new Date() },
  })
    .select("title price startsAt seats")
    .sort({ startsAt: 1 })
    .lean();
  const holds = sessions.flatMap((session) => {
    const activeSeats = session.seats.filter(
      (seat) =>
        String(seat.bookedBy) === String(req.user._id) &&
        seat.status === "pending_payment" &&
        seat.holdExpiresAt > new Date() &&
        seat.paymentOrderId,
    );
    const paymentOrderIds = [
      ...new Set(activeSeats.map((seat) => seat.paymentOrderId)),
    ];
    return paymentOrderIds.map((paymentOrderId) => {
      const seats = activeSeats.filter(
        (seat) => seat.paymentOrderId === paymentOrderId,
      );
      return {
        classId: session._id,
        classTitle: session.title,
        price: session.price,
        startsAt: session.startsAt,
        paymentOrderId,
        seatNumbers: seats.map((seat) => seat.seatNumber),
        expiresAt: seats[0].holdExpiresAt,
      };
    });
  });
  res.json({ success: true, holds });
});

export const createClassSession = asyncHandler(async (req, res) => {
  const {
    title,
    description = "",
    instructorName,
    price,
    startsAt,
    durationMinutes = 60,
    seatCount = 20,
  } = req.body;
  const parsedPrice = Number(price);
  if (
    typeof title !== "string" ||
    title.trim().length < 2 ||
    title.trim().length > 120 ||
    typeof instructorName !== "string" ||
    !instructorName.trim() ||
    instructorName.trim().length > 100 ||
    typeof description !== "string" ||
    description.length > 1000 ||
    !Number.isFinite(parsedPrice) ||
    parsedPrice < 1 ||
    parsedPrice > 1000000 ||
    !Number.isInteger(seatCount) ||
    seatCount < 1 ||
    seatCount > 600 ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 1 ||
    durationMinutes > 600 ||
    !startsAt ||
    !Number.isFinite(Date.parse(startsAt)) ||
    Date.parse(startsAt) <= Date.now()
  ) {
    throw new AppError(
      "Provide a title, instructor, future start time, price, duration, and seatCount from 1 to 600",
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
    description: description.trim(),
    instructorName: instructorName.trim(),
    price: parsedPrice,
    startsAt: new Date(startsAt),
    durationMinutes,
    seats,
  });
  res.status(201).json({ success: true, session });
});

export const updateClassSession = asyncHandler(async (req, res) => {
  const { classId } = req.params;
  validClassId(classId);
  await releaseExpiredHolds();
  const {
    title,
    description = "",
    instructorName,
    price,
    startsAt,
    durationMinutes,
    seatCount,
  } = req.body;
  const parsedPrice = Number(price);
  const parsedSeatCount = Number(seatCount);
  const parsedDuration = Number(durationMinutes);
  if (
    typeof title !== "string" ||
    title.trim().length < 2 ||
    title.trim().length > 120 ||
    typeof instructorName !== "string" ||
    !instructorName.trim() ||
    instructorName.trim().length > 100 ||
    typeof description !== "string" ||
    description.length > 1000 ||
    !Number.isFinite(parsedPrice) ||
    parsedPrice < 1 ||
    parsedPrice > 1000000 ||
    !Number.isInteger(parsedSeatCount) ||
    parsedSeatCount < 1 ||
    parsedSeatCount > 600 ||
    !Number.isInteger(parsedDuration) ||
    parsedDuration < 1 ||
    parsedDuration > 600 ||
    !startsAt ||
    !Number.isFinite(Date.parse(startsAt)) ||
    Date.parse(startsAt) <= Date.now()
  ) {
    throw new AppError(
      "Provide a valid title, instructor, future start time, price, duration, and seatCount from 1 to 600",
      400,
      "INVALID_CLASS_SESSION",
    );
  }
  const currentSession = await ClassSession.findOne({
    _id: classId,
    bookingType: { $in: ["class", null] },
    startsAt: { $gt: new Date() },
  }).lean();
  if (!currentSession) {
    const exists = await ClassSession.exists({ _id: classId });
    if (!exists)
      throw new AppError("Class session not found", 404, "CLASS_NOT_FOUND");
    throw new AppError(
      "A started session cannot be edited",
      409,
      "CLASS_SESSION_LOCKED",
    );
  }

  const occupiedSeats = currentSession.seats.filter((seat) =>
    ["pending_payment", "booked"].includes(seat.status),
  );
  if (occupiedSeats.length > parsedSeatCount)
    throw new AppError(
      "Seat count cannot be lower than the number of held or booked seats",
      409,
      "CLASS_SEAT_COUNT_BELOW_OCCUPIED",
    );

  const occupiedSeatNumbers = new Set(
    occupiedSeats.map((seat) => seat.seatNumber),
  );
  const availableSeats = new Map(
    currentSession.seats
      .filter((seat) => seat.status === "available")
      .map((seat) => [seat.seatNumber, seat]),
  );
  const seats = [...occupiedSeats];
  let seatNumber = 1;
  while (seats.length < parsedSeatCount) {
    const number = `S${String(seatNumber).padStart(2, "0")}`;
    seatNumber += 1;
    if (occupiedSeatNumbers.has(number)) continue;
    seats.push(
      availableSeats.get(number) || { seatNumber: number, status: "available" },
    );
  }
  seats.sort((left, right) =>
    left.seatNumber.localeCompare(right.seatNumber, undefined, { numeric: true }),
  );

  const session = await ClassSession.findOneAndUpdate(
    {
      _id: classId,
      bookingType: { $in: ["class", null] },
      startsAt: { $gt: new Date() },
      updatedAt: currentSession.updatedAt,
      seats: currentSession.seats,
    },
    {
      $set: {
        title: title.trim(),
        description: description.trim(),
        instructorName: instructorName.trim(),
        price: parsedPrice,
        startsAt: new Date(startsAt),
        durationMinutes: parsedDuration,
        seats,
      },
    },
    { new: true, runValidators: true },
  );
  if (session) return res.json({ success: true, session });
  const exists = await ClassSession.exists({ _id: classId });
  if (!exists)
    throw new AppError("Class session not found", 404, "CLASS_NOT_FOUND");
  throw new AppError(
    "The class session changed while it was being edited. Refresh and try again.",
    409,
    "CLASS_SESSION_CHANGED",
  );
});

export const deleteClassSession = asyncHandler(async (req, res) => {
  const { classId } = req.params;
  validClassId(classId);
  await releaseExpiredHolds();
  const session = await ClassSession.findOneAndDelete({
    _id: classId,
    bookingType: { $in: ["class", null] },
    startsAt: { $gt: new Date() },
    seats: {
      $not: {
        $elemMatch: { status: { $in: ["pending_payment", "booked"] } },
      },
    },
  });
  if (session) return res.json({ success: true });

  const exists = await ClassSession.exists({ _id: classId });
  if (!exists)
    throw new AppError("Class session not found", 404, "CLASS_NOT_FOUND");
  throw new AppError(
    "A started session or one with a held or booked seat cannot be deleted",
    409,
    "CLASS_SESSION_LOCKED",
  );
});

export const updateClassSessionPrice = asyncHandler(async (req, res) => {
  const { classId } = req.params;
  validClassId(classId);
  const price = Number(req.body.price);
  if (!Number.isFinite(price) || price < 1 || price > 1000000)
    throw new AppError(
      "Provide a class price from ₹1 to ₹1,000,000",
      400,
      "INVALID_CLASS_PRICE",
    );
  const session = await ClassSession.findOneAndUpdate(
    {
      _id: classId,
      bookingType: { $in: ["class", null] },
      startsAt: { $gt: new Date() },
      seats: {
        $not: {
          $elemMatch: { status: { $in: ["pending_payment", "booked"] } },
        },
      },
    },
    { $set: { price } },
    { new: true, runValidators: true },
  );
  if (session) return res.json({ success: true, session });
  const exists = await ClassSession.exists({ _id: classId });
  if (!exists)
    throw new AppError("Class session not found", 404, "CLASS_NOT_FOUND");
  throw new AppError(
    "Price cannot be changed after a seat is held or booked, or after the class starts",
    409,
    "CLASS_PRICE_LOCKED",
  );
});

async function createClassPayment(
  req,
  res,
  requestedSeatNumbers,
  legacySeatNumber = "",
  bookingType = "class",
) {
  const { classId } = req.params;
  validClassId(classId);
  if (bookingType === "time_slots") {
    const appointment = await ClassSession.findOne({
      _id: classId,
      bookingType: "time_slots",
    })
      .select("owner")
      .lean();
    if (!appointment)
      throw new AppError("Appointment service not found", 404, "SERVICE_NOT_FOUND");
    if (
      appointment.owner &&
      String(appointment.owner) === String(req.user._id)
    )
      throw new AppError(
        "You cannot book an appointment service that you manage",
        403,
        "CANNOT_BOOK_OWN_APPOINTMENT",
      );
    if (
      appointment.owner &&
      !(await User.exists({
        _id: appointment.owner,
        role: "sub_admin",
        active: true,
        "subscription.status": "active",
        "subscription.currentPeriodEnd": { $gt: new Date() },
      }))
    )
      throw new AppError(
        "This appointment is no longer available because the provider's subscription has ended",
        409,
        "APPOINTMENT_PLAN_EXPIRED",
      );
  }
  if (
    !Array.isArray(requestedSeatNumbers) ||
    requestedSeatNumbers.length < 1 ||
    requestedSeatNumbers.length > 2 ||
    requestedSeatNumbers.some(
      (seatNumber) =>
        typeof seatNumber !== "string" ||
        !/^[ST]\d{2,3}$/i.test(seatNumber.trim()),
    )
  )
    throw new AppError(
      "Select between 1 and 2 valid appointment times",
      400,
      "INVALID_SEAT_SELECTION",
    );
  const seatNumbers = [
    ...new Set(requestedSeatNumbers.map((seatNumber) => seatNumber.trim().toUpperCase())),
  ];
  if (seatNumbers.length !== requestedSeatNumbers.length)
    throw new AppError(
      "An appointment time can only be selected once",
      400,
      "DUPLICATE_SEAT_SELECTION",
    );
  const savedPhone =
    req.user.addresses.find((address) => address.isDefault)?.phone ||
    req.user.addresses[0]?.phone;
  const email = String(req.body.email ?? req.user.email ?? "")
    .trim()
    .toLowerCase();
  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    throw new AppError(
      "Enter a valid email address",
      400,
      "INVALID_BOOKING_EMAIL",
    );
  const phoneInput = String(
    req.body.phone ?? req.user.phone ?? savedPhone ?? "",
  ).trim();
  const phone = phoneInput.replace(/\D/g, "");
  if (
    !/^\+?[0-9 ().-]{8,20}$/.test(phoneInput) ||
    phone.length < 10 ||
    phone.length > 15
  )
    throw new AppError(
      "Enter a valid mobile number with 10 to 15 digits",
      400,
      "INVALID_BOOKING_PHONE",
    );
  await releaseExpiredHolds();

  const paymentOrderId = `CLS${crypto.randomUUID().replace(/-/g, "")}`;
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + holdDurationMs);
  await acquireClassPaymentHold({
    accountId: req.user._id,
    classId,
    paymentOrderId,
    seatNumbers,
    expiresAt: holdExpiresAt,
  });
  const availableSeatConditions = seatNumbers.map((seatNumber) => ({
    seats: {
      $elemMatch: {
        seatNumber,
        ...(bookingType === "time_slots"
          ? { slotStartsAt: { $gt: holdExpiresAt } }
          : {}),
        $or: [
          { status: "available" },
          { status: "pending_payment", holdExpiresAt: { $lte: now } },
        ],
      },
    },
  }));
  let session;
  try {
    session = await ClassSession.findOneAndUpdate(
      {
        _id: classId,
        bookingType:
          bookingType === "class" ? { $in: ["class", null] } : bookingType,
        ...(bookingType === "class"
          ? { startsAt: { $gt: holdExpiresAt } }
          : {}),
        price: { $gt: 0 },
        $and: availableSeatConditions,
      },
      {
        $set: {
          "seats.$[selected].status": "pending_payment",
          "seats.$[selected].bookedBy": req.user._id,
          "seats.$[selected].bookedAt": null,
          "seats.$[selected].holdExpiresAt": holdExpiresAt,
          "seats.$[selected].paymentOrderId": paymentOrderId,
          "seats.$[selected].paymentSessionId": "",
          "seats.$[selected].paymentId": "",
        },
      },
      {
        new: true,
        runValidators: true,
        arrayFilters: [{ "selected.seatNumber": { $in: seatNumbers } }],
      },
    ).select("title price startsAt seats");
  } catch (error) {
    await releaseClassPaymentHold(req.user._id, paymentOrderId);
    throw error;
  }
  if (!session) {
    await releaseClassPaymentHold(req.user._id, paymentOrderId);
    const exists = await ClassSession.exists({ _id: classId });
    if (!exists)
      throw new AppError("Class session not found", 404, "CLASS_NOT_FOUND");
    const record = await ClassSession.findById(classId).select("price");
    if (!record?.price)
      throw new AppError(
        "This booking has no payment price. Ask the administrator to set a price before booking.",
        400,
        "CLASS_PRICE_REQUIRED",
      );
    throw new AppError(
      "This appointment time is no longer available or has already started",
      409,
      "SEAT_UNAVAILABLE",
    );
  }

  const returnQuery = legacySeatNumber
    ? `seat=${encodeURIComponent(legacySeatNumber)}`
    : `order_id=${encodeURIComponent(paymentOrderId)}`;
  const returnPath = bookingType === "time_slots" ? "services" : "classes";
  const returnUrl = `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/${returnPath}?payment=return&class_id=${classId}&${returnQuery}`;
  try {
    const cf = await cashfreeRequest("/orders", {
      body: {
        order_id: paymentOrderId,
        order_amount: Number((session.price * seatNumbers.length).toFixed(2)),
        order_currency: "INR",
        order_expiry_time: holdExpiresAt.toISOString(),
        customer_details: {
          customer_id: req.user._id.toString(),
          customer_name: req.user.name,
          customer_email: email,
          customer_phone: phone.slice(-10),
        },
        order_meta: {
          return_url: returnUrl,
          notify_url: process.env.CASHFREE_WEBHOOK_URL || undefined,
        },
      },
    });
    const saved = await ClassSession.updateOne(
      {
        _id: classId,
        seats: {
          $elemMatch: {
            status: "pending_payment",
            paymentOrderId,
            bookedBy: req.user._id,
            holdExpiresAt: { $gt: new Date() },
          },
        },
      },
      {
        $set: { "seats.$[held].paymentSessionId": cf.payment_session_id },
      },
      {
        arrayFilters: [
          { "held.paymentOrderId": paymentOrderId },
        ],
      },
    );
    if (!saved.modifiedCount)
      throw new AppError(
        "Seat hold expired before payment could start. Please select another seat.",
        409,
        "SEAT_HOLD_EXPIRED",
      );
    res.status(201).json({
      success: true,
      payment: {
        paymentSessionId: cf.payment_session_id,
        environment: cashfreeEnvironment(),
        expiresAt: holdExpiresAt,
        paymentOrderId,
        seatNumbers,
        returnUrl,
      },
    });
  } catch (error) {
    await ClassSession.updateOne(
      {
        _id: classId,
        "seats.paymentOrderId": paymentOrderId,
      },
      {
        $set: {
          "seats.$[held].status": "available",
          "seats.$[held].bookedBy": null,
          "seats.$[held].bookedAt": null,
          "seats.$[held].holdExpiresAt": null,
          "seats.$[held].paymentOrderId": "",
          "seats.$[held].paymentSessionId": "",
          "seats.$[held].paymentId": "",
        },
        arrayFilters: [{ "held.paymentOrderId": paymentOrderId }],
      },
    );
    await releaseClassPaymentHold(req.user._id, paymentOrderId);
    throw error;
  }
}

export const reserveClassSeat = asyncHandler(async (req, res) => {
  const seatNumber = req.params.seatNumber.trim().toUpperCase();
  await createClassPayment(req, res, [seatNumber], seatNumber, "class");
});

export const reserveClassSeats = asyncHandler(async (req, res) => {
  await createClassPayment(req, res, req.body.seatNumbers, "", "class");
});

export const reserveServiceSlot = asyncHandler(async (req, res) => {
  req.params.classId = req.params.serviceId;
  const slotId = req.params.slotId.trim().toUpperCase();
  await createClassPayment(req, res, [slotId], "", "time_slots");
});

async function verifyClassPayment(
  req,
  classId,
  paymentOrderId,
  seatNumber,
  bookingType = "class",
) {
  validClassId(classId);
  const session = await ClassSession.findOne({
    _id: classId,
    bookingType: bookingType === "class" ? { $in: ["class", null] } : bookingType,
    "seats.paymentOrderId": paymentOrderId,
  }).select("title price startsAt seats");
  if (!session)
    throw new AppError(
      "Class payment not found",
      404,
      "CLASS_NOT_FOUND",
    );
  const orderSeats = session.seats.filter(
    (item) => item.paymentOrderId === paymentOrderId,
  );
  if (
    !orderSeats.length ||
    orderSeats.some(
      (item) => String(item.bookedBy) !== String(req.user._id),
    )
  )
    throw new AppError("Seat payment not found", 404, "BOOKING_NOT_FOUND");
  if (orderSeats.every((item) => item.status === "booked")) {
    queueClassBookingConfirmationEmail(session._id, paymentOrderId);
    await releaseClassPaymentHold(req.user._id, paymentOrderId);
    return {
      success: true,
      paymentStatus: "paid",
      booking: {
        classTitle: session.title,
        seatNumbers: orderSeats.map((item) => item.seatNumber),
        ...(seatNumber ? { seatNumber } : {}),
      },
    };
  }
  if (
    orderSeats.some(
      (item) =>
        item.status !== "pending_payment" ||
        item.holdExpiresAt <= new Date(),
    )
  )
    throw new AppError(
      "No active payment for these seats",
      409,
      "NO_ACTIVE_PAYMENT",
    );

  const response = await cashfreeRequest(
    `/orders/${encodeURIComponent(paymentOrderId)}/payments`,
    { method: "GET" },
  );
  const payments = Array.isArray(response) ? response : response.data || [];
  const paid = payments.find((item) => item.payment_status === "SUCCESS");
  if (paid) {
    const expectedAmount = Number(
      (session.price * orderSeats.length).toFixed(2),
    );
    if (
      Number.isFinite(Number(paid.payment_amount)) &&
      Number(paid.payment_amount) !== expectedAmount
    )
      throw new AppError(
        "Cashfree payment amount does not match the selected seats",
        409,
        "PAYMENT_AMOUNT_MISMATCH",
      );
    const result = await completeSeatPayment({
      classId,
      paymentOrderId,
      paymentId: String(paid.cf_payment_id || ""),
      expectedSeatCount: orderSeats.length,
    });
    if (!result.confirmed)
      throw new AppError(
        "Payment succeeded after the seat hold expired. Contact support to resolve the payment.",
        409,
        "PAYMENT_AFTER_HOLD_EXPIRY",
      );
    await releaseClassPaymentHold(req.user._id, paymentOrderId);
    queueClassBookingConfirmationEmail(classId, paymentOrderId);
    return {
      success: true,
      paymentStatus: "paid",
      booking: {
        classTitle: session.title,
        seatNumbers: result.seats.map((item) => item.seatNumber),
        ...(seatNumber ? { seatNumber } : {}),
      },
    };
  }
  if (
    payments.length &&
    payments.every((item) =>
      terminalPaymentStatuses.has(item.payment_status),
    )
  ) {
    await releaseFailedPayment(session, paymentOrderId);
    await releaseClassPaymentHold(req.user._id, paymentOrderId);
    return {
      success: true,
      paymentStatus: "failed",
      booking: {
        classTitle: session.title,
        seatNumbers: orderSeats.map((item) => item.seatNumber),
      },
    };
  }
  return {
    success: true,
    paymentStatus: "pending",
    booking: {
      classTitle: session.title,
      seatNumbers: orderSeats.map((item) => item.seatNumber),
    },
  };
}

export const verifyClassSeatPayment = asyncHandler(async (req, res) => {
  const seatNumber = req.params.seatNumber.trim().toUpperCase();
  const lookup = await ClassSession.findOne({
    _id: req.params.classId,
    "seats.seatNumber": seatNumber,
    "seats.bookedBy": req.user._id,
  }).select("seats");
  const seat = lookup?.seats.find(
    (item) =>
      item.seatNumber === seatNumber &&
      String(item.bookedBy) === String(req.user._id),
  );
  if (!seat?.paymentOrderId)
    throw new AppError("Seat payment not found", 404, "BOOKING_NOT_FOUND");
  res.json(
    await verifyClassPayment(
      req,
      req.params.classId,
      seat.paymentOrderId,
      seatNumber,
      "class",
    ),
  );
});

export const verifyClassOrderPayment = asyncHandler(async (req, res) => {
  const { paymentOrderId } = req.params;
  if (!/^CLS[a-f0-9]{32}$/i.test(paymentOrderId))
    throw new AppError("Invalid class payment ID", 400, "INVALID_PAYMENT_ID");
  res.json(
    await verifyClassPayment(req, req.params.classId, paymentOrderId, "", "class"),
  );
});

export const verifyServiceOrderPayment = asyncHandler(async (req, res) => {
  const { paymentOrderId } = req.params;
  if (!/^CLS[a-f0-9]{32}$/i.test(paymentOrderId))
    throw new AppError("Invalid service payment ID", 400, "INVALID_PAYMENT_ID");
  res.json(
    await verifyClassPayment(
      req,
      req.params.serviceId,
      paymentOrderId,
      "",
      "time_slots",
    ),
  );
});

export const cancelClassOrderPayment = asyncHandler(async (req, res) => {
  const { paymentOrderId } = req.params;
  const classId = req.params.serviceId || req.params.classId;
  const bookingType = req.params.serviceId ? "time_slots" : "class";
  validClassId(classId);
  if (!/^CLS[a-f0-9]{32}$/i.test(paymentOrderId))
    throw new AppError("Invalid class payment ID", 400, "INVALID_PAYMENT_ID");

  const session = await ClassSession.findOne({
    _id: classId,
    bookingType:
      bookingType === "class" ? { $in: ["class", null] } : bookingType,
    "seats.paymentOrderId": paymentOrderId,
  }).select("title price startsAt seats");
  if (!session)
    throw new AppError("Class payment not found", 404, "CLASS_NOT_FOUND");
  const orderSeats = session.seats.filter(
    (seat) => seat.paymentOrderId === paymentOrderId,
  );
  if (
    !orderSeats.length ||
    orderSeats.some(
      (seat) => String(seat.bookedBy) !== String(req.user._id),
    )
  )
    throw new AppError("Seat payment not found", 404, "BOOKING_NOT_FOUND");
  if (orderSeats.every((seat) => seat.status === "booked"))
    return res.json({
      success: true,
      paymentStatus: "paid",
      booking: {
        classTitle: session.title,
        seatNumbers: orderSeats.map((seat) => seat.seatNumber),
      },
    });
  if (orderSeats.some((seat) => seat.status !== "pending_payment"))
    throw new AppError(
      "No active payment is available for these seats",
      409,
      "NO_ACTIVE_PAYMENT",
    );

  const paymentsResponse = await cashfreeRequest(
    `/orders/${encodeURIComponent(paymentOrderId)}/payments`,
    { method: "GET" },
  );
  const payments = Array.isArray(paymentsResponse)
    ? paymentsResponse
    : paymentsResponse.data || [];
  if (payments.some((payment) => payment.payment_status === "SUCCESS"))
    return res.json(
      await verifyClassPayment(req, classId, paymentOrderId, "", bookingType),
    );

  if (
    payments.some(
      (payment) => !terminalPaymentStatuses.has(payment.payment_status),
    )
  )
    throw new AppError(
      "Cashfree is still processing this payment. The selected booking remains held until cancellation is confirmed.",
      409,
      "PAYMENT_CANCELLATION_PENDING",
    );

  await releaseFailedPayment(session, paymentOrderId);
  await releaseClassPaymentHold(req.user._id, paymentOrderId);
  res.json({
    success: true,
    paymentStatus: "cancelled",
    booking: {
      classTitle: session.title,
      seatNumbers: orderSeats.map((seat) => seat.seatNumber),
    },
  });
});

export const resumeClassOrderPayment = asyncHandler(async (req, res) => {
  const { classId, paymentOrderId } = req.params;
  if (!/^CLS[a-f0-9]{32}$/i.test(paymentOrderId))
    throw new AppError("Invalid class payment ID", 400, "INVALID_PAYMENT_ID");
  const verification = await verifyClassPayment(
    req,
    classId,
    paymentOrderId,
    "",
  );
  if (verification.paymentStatus !== "pending")
    return res.json(verification);

  const session = await ClassSession.findOne({
    _id: classId,
    seats: {
      $elemMatch: {
        paymentOrderId,
        bookedBy: req.user._id,
        status: "pending_payment",
        holdExpiresAt: { $gt: new Date() },
        paymentSessionId: { $ne: "" },
      },
    },
  })
    .select("seats")
    .lean();
  const seats =
    session?.seats.filter(
      (seat) =>
        seat.paymentOrderId === paymentOrderId &&
        String(seat.bookedBy) === String(req.user._id) &&
        seat.status === "pending_payment",
    ) || [];
  if (!seats.length) {
    const confirmedSession = await ClassSession.findOne({
      _id: classId,
      seats: {
        $elemMatch: {
          paymentOrderId,
          bookedBy: req.user._id,
          status: "booked",
        },
      },
    })
      .select("title seats")
      .lean();
    const bookedSeats =
      confirmedSession?.seats.filter(
        (seat) =>
          seat.paymentOrderId === paymentOrderId &&
          String(seat.bookedBy) === String(req.user._id) &&
          seat.status === "booked",
      ) || [];
    if (bookedSeats.length)
      return res.json({
        success: true,
        paymentStatus: "paid",
        booking: {
          classTitle: confirmedSession.title,
          seatNumbers: bookedSeats.map((seat) => seat.seatNumber),
        },
      });
    throw new AppError(
      "No active payment is available for these seats",
      409,
      "NO_ACTIVE_PAYMENT",
    );
  }
  res.json({
    ...verification,
    payment: {
      paymentSessionId: seats[0].paymentSessionId,
      environment: cashfreeEnvironment(),
      expiresAt: seats[0].holdExpiresAt,
      returnUrl: `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/classes?payment=return&class_id=${classId}&order_id=${encodeURIComponent(paymentOrderId)}`,
    },
  });
});

export const processClassPaymentWebhook = async ({
  paymentOrderId,
  paymentStatus,
  paymentId,
  paymentAmount,
}) => {
  const session = await ClassSession.findOne({
    "seats.paymentOrderId": paymentOrderId,
  }).select("price seats");
  if (!session) return false;
  const seat = session.seats.find(
    (item) => item.paymentOrderId === paymentOrderId,
  );
  if (!seat) return false;
  const orderSeats = session.seats.filter(
    (item) => item.paymentOrderId === paymentOrderId,
  );
  if (paymentStatus === "SUCCESS") {
    if (
      Number.isFinite(Number(paymentAmount)) &&
      Number(paymentAmount) !==
        Number((session.price * orderSeats.length).toFixed(2))
    )
      return true;
    const result = await completeSeatPayment({
      classId: session._id,
      paymentOrderId,
      paymentId,
      expectedSeatCount: orderSeats.length,
    });
    if (result.confirmed) {
      const accountId = seat.bookedBy;
      await releaseClassPaymentHold(accountId, paymentOrderId);
      queueClassBookingConfirmationEmail(session._id, paymentOrderId);
    }
  } else if (terminalPaymentStatuses.has(paymentStatus)) {
    await releaseFailedPayment(session, paymentOrderId);
    await releaseClassPaymentHold(seat.bookedBy, paymentOrderId);
  }
  return true;
};

export const myClassBookings = asyncHandler(async (req, res) => {
  const sessions = await ClassSession.find({
    bookingType: { $in: ["class", null] },
    "seats.bookedBy": req.user._id,
    "seats.status": "booked",
  })
    .select("title instructorName price startsAt durationMinutes seats")
    .sort({ startsAt: 1 })
    .lean();
  const bookings = sessions.flatMap((session) =>
    session.seats
      .filter(
        (seat) =>
          String(seat.bookedBy) === String(req.user._id) &&
          seat.status === "booked",
      )
      .map((seat) => ({
        classId: session._id,
        classTitle: session.title,
        instructorName: session.instructorName,
        price: session.price,
        startsAt: session.startsAt,
        durationMinutes: session.durationMinutes,
        seatNumber: seat.seatNumber,
        status: seat.status,
      })),
  );
  res.json({ success: true, bookings });
});
