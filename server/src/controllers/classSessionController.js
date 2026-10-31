import crypto from "node:crypto";
import mongoose from "mongoose";
import ClassSession from "../models/ClassSession.js";
import ClassPaymentHold from "../models/ClassPaymentHold.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  cashfreeEnvironment,
  cashfreeRequest,
} from "../services/cashfreeService.js";
import { sendClassWhatsApp } from "../services/whatsappService.js";

const holdDurationMs = 20 * 60 * 1000;
const terminalPaymentStatuses = new Set([
  "NOT_ATTEMPTED",
  "FAILED",
  "USER_DROPPED",
  "CANCELLED",
  "VOID",
]);

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
      startsAt: { $gt: now },
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
  const sessions = await ClassSession.find({ startsAt: { $gte: new Date() } })
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
  const filter = {};
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
  const seats = Array.from({ length: parsedSeatCount }, (_, index) => ({
    seatNumber: `S${String(index + 1).padStart(2, "0")}`,
    status: "available",
  }));
  const session = await ClassSession.findOneAndUpdate(
    {
      _id: classId,
      startsAt: { $gt: new Date() },
      seats: {
        $not: {
          $elemMatch: { status: { $in: ["pending_payment", "booked"] } },
        },
      },
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
    "A started session or one with a held or booked seat cannot be edited",
    409,
    "CLASS_SESSION_LOCKED",
  );
});

export const deleteClassSession = asyncHandler(async (req, res) => {
  const { classId } = req.params;
  validClassId(classId);
  await releaseExpiredHolds();
  const session = await ClassSession.findOneAndDelete({
    _id: classId,
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
) {
  const { classId } = req.params;
  validClassId(classId);
  if (
    !Array.isArray(requestedSeatNumbers) ||
    requestedSeatNumbers.length < 1 ||
    requestedSeatNumbers.length > 3 ||
    requestedSeatNumbers.some(
      (seatNumber) =>
        typeof seatNumber !== "string" ||
        !/^S\d{2,3}$/i.test(seatNumber.trim()),
    )
  )
    throw new AppError(
      "Select between 1 and 3 valid seats",
      400,
      "INVALID_SEAT_SELECTION",
    );
  const seatNumbers = [
    ...new Set(requestedSeatNumbers.map((seatNumber) => seatNumber.trim().toUpperCase())),
  ];
  if (seatNumbers.length !== requestedSeatNumbers.length)
    throw new AppError(
      "A seat can only be selected once",
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
        startsAt: { $gt: holdExpiresAt },
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
        "This class has no payment price. Ask the administrator to set a price before booking.",
        400,
        "CLASS_PRICE_REQUIRED",
      );
    throw new AppError(
      "This seat is no longer available, or the class has already started",
      409,
      "SEAT_UNAVAILABLE",
    );
  }

  const returnQuery = legacySeatNumber
    ? `seat=${encodeURIComponent(legacySeatNumber)}`
    : `order_id=${encodeURIComponent(paymentOrderId)}`;
  const returnUrl = `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/classes?payment=return&class_id=${classId}&${returnQuery}`;
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
  await createClassPayment(req, res, [seatNumber], seatNumber);
});

export const reserveClassSeats = asyncHandler(async (req, res) => {
  await createClassPayment(req, res, req.body.seatNumbers);
});

async function verifyClassPayment(req, classId, paymentOrderId, seatNumber) {
  validClassId(classId);
  const session = await ClassSession.findOne({
    _id: classId,
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
    void sendClassWhatsApp(session._id, paymentOrderId).catch((error) =>
      console.error("Could not process WhatsApp class notification", {
        paymentOrderId,
        code: error.code || "WHATSAPP_SEND_FAILED",
      }),
    );
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
    void sendClassWhatsApp(classId, paymentOrderId).catch((error) =>
      console.error("Could not process WhatsApp class notification", {
        paymentOrderId,
        code: error.code || "WHATSAPP_SEND_FAILED",
      }),
    );
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
    ),
  );
});

export const verifyClassOrderPayment = asyncHandler(async (req, res) => {
  const { paymentOrderId } = req.params;
  if (!/^CLS[a-f0-9]{32}$/i.test(paymentOrderId))
    throw new AppError("Invalid class payment ID", 400, "INVALID_PAYMENT_ID");
  res.json(
    await verifyClassPayment(req, req.params.classId, paymentOrderId, ""),
  );
});

export const cancelClassOrderPayment = asyncHandler(async (req, res) => {
  const { classId, paymentOrderId } = req.params;
  validClassId(classId);
  if (!/^CLS[a-f0-9]{32}$/i.test(paymentOrderId))
    throw new AppError("Invalid class payment ID", 400, "INVALID_PAYMENT_ID");

  const session = await ClassSession.findOne({
    _id: classId,
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
      await verifyClassPayment(req, classId, paymentOrderId, ""),
    );

  if (
    payments.some(
      (payment) => !terminalPaymentStatuses.has(payment.payment_status),
    )
  )
    throw new AppError(
      "Cashfree is still processing this payment. The seats remain held until the cancellation is confirmed.",
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
      void sendClassWhatsApp(session._id, paymentOrderId).catch((error) =>
        console.error("Could not process WhatsApp class notification", {
          paymentOrderId,
          code: error.code || "WHATSAPP_SEND_FAILED",
        }),
      );
    }
  } else if (terminalPaymentStatuses.has(paymentStatus)) {
    await releaseFailedPayment(session, paymentOrderId);
    await releaseClassPaymentHold(seat.bookedBy, paymentOrderId);
  }
  return true;
};

export const myClassBookings = asyncHandler(async (req, res) => {
  const sessions = await ClassSession.find({
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
