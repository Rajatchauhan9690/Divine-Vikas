import rateLimit from "express-rate-limit";

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
