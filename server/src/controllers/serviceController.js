import mongoose from "mongoose";
import ClassSession from "../models/ClassSession.js";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

function serviceOwnerFilter(user) {
  return user.role === "sub_admin" ? { owner: user._id } : {};
}

async function countFutureOwnerSessions(ownerId, excludeServiceId) {
  const match = {
    owner: ownerId,
    bookingType: "time_slots",
    ...(excludeServiceId ? { _id: { $ne: excludeServiceId } } : {}),
  };
  const [result] = await ClassSession.aggregate([
    { $match: match },
    {
      $project: {
        count: {
          $size: {
            $filter: {
              input: { $ifNull: ["$seats", []] },
              as: "slot",
              cond: { $gt: ["$$slot.slotStartsAt", new Date()] },
            },
          },
        },
      },
    },
    { $group: { _id: null, total: { $sum: "$count" } } },
  ]);
  return result?.total || 0;
}

function parseServiceInput(body) {
  const { title, description = "", instructorName, price, durationMinutes, slots } =
    body;
  const parsedPrice = Number(price);
  const parsedDuration = Number(durationMinutes);
  if (
    typeof title !== "string" ||
    title.trim().length < 2 ||
    title.trim().length > 120 ||
    typeof description !== "string" ||
    description.length > 1000 ||
    typeof instructorName !== "string" ||
    !instructorName.trim() ||
    instructorName.trim().length > 100 ||
    !Number.isFinite(parsedPrice) ||
    parsedPrice < 1 ||
    parsedPrice > 1000000 ||
    !Number.isInteger(parsedDuration) ||
    parsedDuration < 5 ||
    parsedDuration > 600 ||
    !Array.isArray(slots) ||
    slots.length < 1 ||
    slots.length > 100
  )
    throw new AppError(
      "Provide a service name, instructor, price, duration from 5 to 600 minutes, and 1 to 100 time slots",
      400,
      "INVALID_SERVICE",
    );

  const parsedSlots = slots.map((value) => {
    const time = Date.parse(value);
    if (typeof value !== "string" || !Number.isFinite(time) || time <= Date.now())
      throw new AppError(
        "Every appointment time must be a valid future date and time",
        400,
        "INVALID_SERVICE_SLOT",
      );
    return new Date(time);
  });
  parsedSlots.sort((left, right) => left - right);
  if (new Set(parsedSlots.map((date) => date.toISOString())).size !== parsedSlots.length)
    throw new AppError(
      "Appointment times must be unique",
      400,
      "DUPLICATE_SERVICE_SLOT",
    );
  if (
    parsedSlots.some(
      (date, index) =>
        index > 0 &&
        date.getTime() - parsedSlots[index - 1].getTime() <
          parsedDuration * 60 * 1000,
    )
  )
    throw new AppError(
      "Appointment times for this service cannot overlap",
      400,
      "OVERLAPPING_SERVICE_SLOTS",
    );

  return {
    title: title.trim(),
    description: description.trim(),
    instructorName: instructorName.trim(),
    price: parsedPrice,
    durationMinutes: parsedDuration,
    startsAt: new Date(Math.min(...parsedSlots.map((date) => date.getTime()))),
    seats: parsedSlots.map((slotStartsAt, index) => ({
        seatNumber: `T${String(index + 1).padStart(3, "0")}`,
        slotStartsAt,
        status: "available",
      })),
  };
}

function validateSubscriptionSlotEnd(values, user) {
  if (user.role !== "sub_admin") return;
  const periodEnd = user.subscription?.currentPeriodEnd;
  if (
    !periodEnd ||
    values.seats.some(
      (slot) =>
        slot.slotStartsAt.getTime() +
          values.durationMinutes * 60 * 1000 >
        periodEnd.getTime(),
    )
  )
    throw new AppError(
      "Appointment times must finish before your subscription ends",
      403,
      "APPOINTMENT_AFTER_SUBSCRIPTION_END",
    );
}

export const listServiceSessions = asyncHandler(async (req, res) => {
  const now = new Date();
  const eligibleOwners = await User.find({
    role: "sub_admin",
    active: true,
    "subscription.status": "active",
    "subscription.currentPeriodEnd": { $gt: now },
  })
    .select("_id subscription.currentPeriodEnd")
    .lean();
  const ownerEndById = new Map(
    eligibleOwners.map((owner) => [
      String(owner._id),
      owner.subscription.currentPeriodEnd,
    ]),
  );
  const serviceFilter = {
    bookingType: "time_slots",
    "seats.slotStartsAt": { $gt: now },
    $or: [{ owner: null }, { owner: { $in: [...ownerEndById.keys()] } }],
  };
  if (req.user?.role === "sub_admin")
    serviceFilter.owner = { $ne: req.user._id };
  const services = await ClassSession.find(serviceFilter)
    .select("title description instructorName price durationMinutes seats owner")
    .sort({ startsAt: 1 })
    .lean();
  res.json({
    success: true,
    services: services.map((service) => ({
      ...service,
      slots: service.seats
        .filter(
          (slot) => {
            const ownerEnd = service.owner
              ? ownerEndById.get(String(service.owner))
              : null;
            return (
              slot.slotStartsAt > now &&
              (!ownerEnd ||
                slot.slotStartsAt.getTime() +
                  service.durationMinutes * 60 * 1000 <=
                  ownerEnd.getTime()) &&
              (slot.status === "available" ||
                (slot.status === "pending_payment" &&
                  slot.holdExpiresAt <= now))
            );
          },
        )
        .map((slot) => ({
          slotId: slot.seatNumber,
          startsAt: slot.slotStartsAt,
        })),
      seats: undefined,
      owner: undefined,
    })),
  });
});

export const listAdminServices = asyncHandler(async (req, res) => {
  const view = ["all", "past", "upcoming"].includes(req.query.view)
    ? req.query.view
    : "upcoming";
  const filter = { bookingType: "time_slots", ...serviceOwnerFilter(req.user) };
  const now = new Date();
  if (view === "past") filter.startsAt = { $lt: now };
  if (view === "upcoming") filter["seats.slotStartsAt"] = { $gt: now };
  const search = String(req.query.search || "").trim().slice(0, 100);
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = ["title", "instructorName", "description"].map((field) => ({
      [field]: { $regex: escaped, $options: "i" },
    }));
  }
  const services = await ClassSession.find(filter)
    .select("title description instructorName price startsAt durationMinutes seats owner")
    .sort({ startsAt: view === "upcoming" ? 1 : -1 })
    .lean();
  res.json({ success: true, services });
});

export const createService = asyncHandler(async (req, res) => {
  if (
    req.user.role === "sub_admin" &&
    (await ClassSession.countDocuments({
      bookingType: "time_slots",
      owner: req.user._id,
    })) >= req.user.subscription.serviceLimit
  )
    throw new AppError(
      `Your subscription allows up to ${req.user.subscription.serviceLimit} appointment services. To add more appointment services or bookable time slots, contact your administrator to discuss increasing your subscription capacity.`,
      403,
      "SERVICE_LIMIT_REACHED",
    );
  const values = parseServiceInput(req.body);
    validateSubscriptionSlotEnd(values, req.user);
    if (req.user.role === "sub_admin") {
    const totalSessions = await countFutureOwnerSessions(req.user._id);
    const sessionLimit = req.user.subscription.sessionLimit || 100;
    if (totalSessions + values.seats.length > sessionLimit)
      throw new AppError(
        `Your subscription allows up to ${sessionLimit} bookable appointment time slots. To add more appointment services or bookable time slots, contact your administrator to discuss increasing your subscription capacity.`,
        403,
        "SESSION_LIMIT_REACHED",
      );
  }
  const service = await ClassSession.create({
    ...values,
    bookingType: "time_slots",
    owner: req.user.role === "sub_admin" ? req.user._id : null,
  });
  res.status(201).json({ success: true, service });
});

export const updateService = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  if (!mongoose.isValidObjectId(serviceId))
    throw new AppError("Invalid service ID", 400, "INVALID_SERVICE_ID");
  const values = parseServiceInput(req.body);
  validateSubscriptionSlotEnd(values, req.user);
  if (req.user.role === "sub_admin") {
    const totalSessions = await countFutureOwnerSessions(
      req.user._id,
      new mongoose.Types.ObjectId(serviceId),
    );
    const sessionLimit = req.user.subscription.sessionLimit || 100;
    if (totalSessions + values.seats.length > sessionLimit)
      throw new AppError(
        `Your subscription allows up to ${sessionLimit} bookable appointment time slots. To add more appointment services or bookable time slots, contact your administrator to discuss increasing your subscription capacity.`,
        403,
        "SESSION_LIMIT_REACHED",
      );
  }
  const service = await ClassSession.findOneAndUpdate(
    {
      _id: serviceId,
      bookingType: "time_slots",
      ...serviceOwnerFilter(req.user),
      seats: {
        $not: { $elemMatch: { status: { $in: ["pending_payment", "booked"] } } },
      },
    },
    { $set: values },
    { new: true, runValidators: true },
  );
  if (service) return res.json({ success: true, service });
  const exists = await ClassSession.exists({
    _id: serviceId,
    bookingType: "time_slots",
    ...serviceOwnerFilter(req.user),
  });
  if (!exists) throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
  throw new AppError(
    "A service with held or booked appointment times cannot be edited",
    409,
    "SERVICE_LOCKED",
  );
});

export const deleteService = asyncHandler(async (req, res) => {
  const { serviceId } = req.params;
  if (!mongoose.isValidObjectId(serviceId))
    throw new AppError("Invalid service ID", 400, "INVALID_SERVICE_ID");
  const service = await ClassSession.findOneAndDelete({
    _id: serviceId,
    bookingType: "time_slots",
    ...serviceOwnerFilter(req.user),
    seats: {
      $not: { $elemMatch: { status: { $in: ["pending_payment", "booked"] } } },
    },
  });
  if (service) return res.json({ success: true });
  const exists = await ClassSession.exists({
    _id: serviceId,
    bookingType: "time_slots",
    ...serviceOwnerFilter(req.user),
  });
  if (!exists) throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
  throw new AppError(
    "A service with held or booked appointment times cannot be deleted",
    409,
    "SERVICE_LOCKED",
  );
});

export const listServiceBookings = asyncHandler(async (req, res) => {
  const filter = {
    bookingType: "time_slots",
    ...serviceOwnerFilter(req.user),
    "seats.status": { $in: ["booked", "pending_payment"] },
  };
  const services = await ClassSession.find(filter)
    .select("title instructorName price durationMinutes seats")
    .populate("seats.bookedBy", "name email phone")
    .sort({ startsAt: -1 })
    .lean();
  const bookings = services.flatMap((service) =>
    service.seats
      .filter(
        (slot) =>
          slot.status === "booked" ||
          (slot.status === "pending_payment" && slot.holdExpiresAt > new Date()),
      )
      .map((slot) => ({
        serviceId: service._id,
        serviceTitle: service.title,
        instructorName: service.instructorName,
        price: service.price,
        durationMinutes: service.durationMinutes,
        slotId: slot.seatNumber,
        startsAt: slot.slotStartsAt,
        status: slot.status,
        bookedAt: slot.bookedAt,
        holdExpiresAt: slot.holdExpiresAt,
        customer: slot.bookedBy,
      })),
  );
  res.json({ success: true, bookings });
});

export const listSubAdminAppointments = asyncHandler(async (req, res) => {
  const { subAdminId } = req.params;
  if (!mongoose.isValidObjectId(subAdminId))
    throw new AppError("Invalid sub-admin ID", 400, "INVALID_SUB_ADMIN_ID");

  const subAdmin = await User.findOne({
    _id: subAdminId,
    role: "sub_admin",
  })
    .select("_id")
    .lean();
  if (!subAdmin)
    throw new AppError("Sub-admin account not found", 404, "SUB_ADMIN_NOT_FOUND");

  const now = new Date();
  const services = await ClassSession.find({
    bookingType: "time_slots",
    owner: subAdmin._id,
  })
    .select("title description instructorName price startsAt durationMinutes seats")
    .populate("seats.bookedBy", "name email phone")
    .sort({ startsAt: -1 })
    .lean();

  res.json({
    success: true,
    services: services.map((service) => ({
      ...service,
      appointments: service.seats.map((slot) => {
        const expiredHold =
          slot.status === "pending_payment" &&
          slot.holdExpiresAt &&
          slot.holdExpiresAt <= now;
        const status = expiredHold ? "available" : slot.status;
        return {
          slotId: slot.seatNumber,
          startsAt: slot.slotStartsAt,
          status,
          bookedAt: slot.bookedAt,
          holdExpiresAt: status === "pending_payment" ? slot.holdExpiresAt : null,
          customer:
            status === "booked" || status === "pending_payment"
              ? slot.bookedBy
              : null,
        };
      }),
    })),
  });
});
