import rateLimit from "express-rate-limit";
import { createHash } from "node:crypto";
import RateLimitBucket from "../models/RateLimitBucket.js";

const message = {
  success: false,
  code: "RATE_LIMITED",
  message: "Too many requests. Please try again later.",
};
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message,
});
// IP-level protection plus database-backed per-account lockout in authController.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    code: "AUTH_RATE_LIMITED",
    message: "Too many authentication attempts. Try again later.",
  },
});
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    code: "LOGIN_RATE_LIMITED",
    message: "Too many login attempts. Try again later.",
  },
});
const classBookingRateLimitMessage = {
  success: false,
  code: "CLASS_BOOKING_RATE_LIMITED",
  message: "Too many class payment attempts. Try again after 15 min.",
};
const classBookingWindowMs = 15 * 60 * 1000;

async function incrementClassBookingBucket(key, now) {
  const resetAt = new Date(now.getTime() + classBookingWindowMs);
  const update = [
    {
      $set: {
        count: {
          $cond: [
            { $gt: ["$resetAt", now] },
            { $add: [{ $ifNull: ["$count", 0] }, 1] },
            1,
          ],
        },
        resetAt: {
          $cond: [{ $gt: ["$resetAt", now] }, "$resetAt", resetAt],
        },
        expiresAt: {
          $cond: [{ $gt: ["$resetAt", now] }, "$resetAt", resetAt],
        },
      },
    },
  ];
  try {
    return await RateLimitBucket.findOneAndUpdate({ key }, update, {
      upsert: true,
      new: true,
    })
      .select("count resetAt")
      .lean();
  } catch (error) {
    if (error.code !== 11000) throw error;
    return RateLimitBucket.findOneAndUpdate({ key }, update, {
      new: true,
    })
      .select("count resetAt")
      .lean();
  }
}

export async function classBookingRateLimiter(req, res, next) {
  try {
    const now = new Date();
    const ipHash = createHash("sha256").update(req.ip).digest("hex");
    const [account, ip] = await Promise.all([
      incrementClassBookingBucket(`account:${req.user._id}`, now),
      incrementClassBookingBucket(`ip:${ipHash}`, now),
    ]);
    if (account.count > 5 || ip.count > 20) {
      const resetAt =
        account.count > 5 && ip.count > 20
          ? Math.min(account.resetAt.getTime(), ip.resetAt.getTime())
          : account.count > 5
            ? account.resetAt.getTime()
            : ip.resetAt.getTime();
      res.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000))),
      );
      return res.status(429).json(classBookingRateLimitMessage);
    }
    return next();
  } catch (error) {
    return next(error);
  }
}
