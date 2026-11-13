import Coupon from "../models/Coupon.js";
import Product from "../models/Product.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  couponDetails,
  findEligibleCoupon,
  normalizeCouponCode,
} from "../services/couponService.js";

function validateCouponInput(body) {
  const code = normalizeCouponCode(body.code);
  const type = body.discountType;
  const value = Number(body.value);
  const minimumOrderAmount = Number(body.minimumOrderAmount ?? 0);
  const maxDiscountAmount =
    body.maxDiscountAmount === "" ||
    body.maxDiscountAmount === null ||
    body.maxDiscountAmount === undefined
      ? null
      : Number(body.maxDiscountAmount);
  const usageLimit = Number(body.usageLimit ?? 0);
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (!/^[A-Z0-9_-]{3,30}$/.test(code))
    throw new AppError("Coupon code must be 3–30 letters or numbers.", 400, "INVALID_COUPON");
  if (!["percent", "fixed"].includes(type))
    throw new AppError("Choose a valid coupon discount type.", 400, "INVALID_COUPON");
  if (!Number.isFinite(value) || value <= 0 || (type === "percent" && value > 100))
    throw new AppError("Enter a valid discount value.", 400, "INVALID_COUPON");
  if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0)
    throw new AppError("Enter a valid minimum order amount.", 400, "INVALID_COUPON");
  if (
    maxDiscountAmount !== null &&
    (!Number.isFinite(maxDiscountAmount) || maxDiscountAmount <= 0)
  )
    throw new AppError("Enter a valid maximum discount.", 400, "INVALID_COUPON");
  if (!Number.isInteger(usageLimit) || usageLimit < 0)
    throw new AppError("Usage limit must be zero or a positive whole number.", 400, "INVALID_COUPON");
  if (
    (startsAt && Number.isNaN(startsAt.getTime())) ||
    (endsAt && Number.isNaN(endsAt.getTime())) ||
    (startsAt && endsAt && startsAt >= endsAt)
  )
    throw new AppError("Enter a valid coupon date range.", 400, "INVALID_COUPON");
  return {
    code,
    description: String(body.description || "").trim(),
    discountType: type,
    value,
    maxDiscountAmount: type === "percent" ? maxDiscountAmount : null,
    minimumOrderAmount,
    startsAt,
    endsAt,
    usageLimit,
    active: body.active !== false,
  };
}

async function getSubtotal(items) {
  if (!Array.isArray(items) || !items.length || items.length > 30)
    throw new AppError("Add items to your cart first.", 400, "INVALID_ORDER");
  const ids = [...new Set(items.map((item) => item.product))];
  const products = await Product.find({ _id: { $in: ids }, active: true });
  const byId = new Map(products.map((product) => [String(product._id), product]));
  let subtotal = 0;
  for (const item of items) {
    const product = byId.get(String(item.product));
    const quantity = Number(item.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20)
      throw new AppError("An order item is invalid.", 400, "INVALID_ORDER_ITEM");
    subtotal += product.price * quantity;
  }
  return subtotal;
}

export const searchCoupons = asyncHandler(async (req, res) => {
  const subtotal = await getSubtotal(req.body.items);
  const search = normalizeCouponCode(req.body.search);
  if (search.length < 2) return res.json({ success: true, coupons: [] });
  const now = new Date();
  const coupons = await Coupon.find({
    active: true,
    code: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") },
    minimumOrderAmount: { $lte: subtotal },
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
      {
        $or: [
          { usageLimit: 0 },
          {
            $expr: {
              $lt: [{ $add: ["$redeemedCount", "$reservedCount"] }, "$usageLimit"],
            },
          },
        ],
      },
    ],
  })
    .sort({ code: 1 })
    .limit(8)
    .lean();
  res.json({
    success: true,
    coupons: coupons.map((coupon) => couponDetails(coupon, subtotal)),
  });
});

export const validateCoupon = asyncHandler(async (req, res) => {
  const subtotal = await getSubtotal(req.body.items);
  const { details } = await findEligibleCoupon(req.body.code, subtotal);
  res.json({ success: true, coupon: details });
});

export const listAdminCoupons = asyncHandler(async (_req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, coupons });
});

export const createAdminCoupon = asyncHandler(async (req, res) => {
  try {
    const coupon = await Coupon.create(validateCouponInput(req.body));
    res.status(201).json({ success: true, coupon });
  } catch (error) {
    if (error.code === 11000)
      throw new AppError("That coupon code already exists.", 409, "COUPON_CODE_EXISTS");
    throw error;
  }
});

export const updateAdminCoupon = asyncHandler(async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(
      req.params.couponId,
      validateCouponInput(req.body),
      { new: true, runValidators: true },
    );
    if (!coupon) throw new AppError("Coupon not found.", 404, "NOT_FOUND");
    res.json({ success: true, coupon });
  } catch (error) {
    if (error.code === 11000)
      throw new AppError("That coupon code already exists.", 409, "COUPON_CODE_EXISTS");
    throw error;
  }
});

export const deleteAdminCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.couponId);
  if (!coupon) throw new AppError("Coupon not found.", 404, "NOT_FOUND");
  if (coupon.reservedCount)
    throw new AppError(
      "This coupon has active checkouts. Deactivate it instead.",
      409,
      "COUPON_IN_USE",
    );
  await coupon.deleteOne();
  res.json({ success: true });
});
