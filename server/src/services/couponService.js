import Coupon from "../models/Coupon.js";
import AppError from "../utils/AppError.js";

export function normalizeCouponCode(code) {
  return typeof code === "string" ? code.trim().toUpperCase() : "";
}

export function couponDiscount(coupon, subtotal) {
  let amount =
    coupon.discountType === "percent"
      ? (subtotal * coupon.value) / 100
      : coupon.value;
  if (coupon.discountType === "percent" && coupon.maxDiscountAmount != null)
    amount = Math.min(amount, coupon.maxDiscountAmount);
  return Number(Math.min(subtotal, amount).toFixed(2));
}

function isAvailable(coupon, subtotal, now = new Date()) {
  return (
    coupon.active &&
    (!coupon.startsAt || coupon.startsAt <= now) &&
    (!coupon.endsAt || coupon.endsAt > now) &&
    subtotal >= coupon.minimumOrderAmount &&
    (!coupon.usageLimit ||
      coupon.redeemedCount + coupon.reservedCount < coupon.usageLimit)
  );
}

export function couponDetails(coupon, subtotal) {
  return {
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    value: coupon.value,
    maxDiscountAmount: coupon.maxDiscountAmount,
    minimumOrderAmount: coupon.minimumOrderAmount,
    discountAmount: couponDiscount(coupon, subtotal),
  };
}

export async function findEligibleCoupon(code, subtotal) {
  const coupon = await Coupon.findOne({ code: normalizeCouponCode(code) });
  if (!coupon || !isAvailable(coupon, subtotal))
    throw new AppError(
      "This coupon is invalid, expired, or not available for this order.",
      400,
      "COUPON_UNAVAILABLE",
    );
  return { coupon, details: couponDetails(coupon, subtotal) };
}

export async function reserveCoupon(code, subtotal) {
  const normalizedCode = normalizeCouponCode(code);
  const now = new Date();
  const coupon = await Coupon.findOneAndUpdate(
    {
      code: normalizedCode,
      active: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
      ],
      minimumOrderAmount: { $lte: subtotal },
      $or: [
        { usageLimit: 0 },
        {
          $expr: {
            $lt: [{ $add: ["$redeemedCount", "$reservedCount"] }, "$usageLimit"],
          },
        },
      ],
    },
    { $inc: { reservedCount: 1 } },
    { new: true },
  );
  if (!coupon)
    throw new AppError(
      "This coupon is no longer available. Search and apply another coupon.",
      409,
      "COUPON_UNAVAILABLE",
    );
  return { coupon, details: couponDetails(coupon, subtotal) };
}

export async function releaseCouponReservation(attempt) {
  const couponData = attempt.coupon;
  if (!couponData?.couponId || couponData.reservationStatus !== "reserved")
    return;
  const claimed = await attempt.constructor.findOneAndUpdate(
    { _id: attempt._id, "coupon.reservationStatus": "reserved" },
    { $set: { "coupon.reservationStatus": "releasing" } },
    { new: true },
  );
  if (!claimed) return;
  await Coupon.updateOne(
    { _id: couponData.couponId, reservedCount: { $gt: 0 } },
    { $inc: { reservedCount: -1 } },
  );
  await attempt.constructor.updateOne(
    { _id: attempt._id, "coupon.reservationStatus": "releasing" },
    { $set: { "coupon.reservationStatus": "released" } },
  );
}

export async function redeemCouponReservation(attempt) {
  const couponData = attempt.coupon;
  if (!couponData?.couponId || couponData.reservationStatus !== "reserved")
    return;
  const claimed = await attempt.constructor.findOneAndUpdate(
    { _id: attempt._id, "coupon.reservationStatus": "reserved" },
    { $set: { "coupon.reservationStatus": "redeeming" } },
    { new: true },
  );
  if (!claimed) return;
  const result = await Coupon.updateOne(
    { _id: couponData.couponId, reservedCount: { $gt: 0 } },
    { $inc: { reservedCount: -1, redeemedCount: 1 } },
  );
  if (!result.modifiedCount)
    throw new Error(`Could not redeem coupon reservation ${couponData.code}`);
  await attempt.constructor.updateOne(
    { _id: attempt._id, "coupon.reservationStatus": "redeeming" },
    { $set: { "coupon.reservationStatus": "redeemed" } },
  );
}
