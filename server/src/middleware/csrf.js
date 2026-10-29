import crypto from "node:crypto";
import { env } from "../config/env.js";
import AppError from "../utils/AppError.js";

export const csrfCookieOptions = () => ({
  httpOnly: false,
  secure: env.nodeEnv === "production",
  sameSite: env.sameSite,
  path: "/api/auth",
  maxAge: 2 * 60 * 60 * 1000,
});

export function issueCsrfToken(req, res) {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie("csrfToken", token, csrfCookieOptions());
  res.setHeader("Cache-Control", "no-store");
  return token;
}

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
export function csrfProtection(req, _res, next) {
  if (safeMethods.has(req.method)) return next();
  const origin = req.get("origin");
  // Browser requests must originate from the configured frontend. Non-browser clients
  // without Origin still need the double-submit token for cookie-backed auth actions.
  if (origin && origin !== env.clientOrigin)
    return next(
      new AppError(
        "Request origin is not allowed",
        403,
        "CSRF_ORIGIN_REJECTED",
      ),
    );
  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.get("x-csrf-token");
  if (
    typeof cookieToken !== "string" ||
    typeof headerToken !== "string" ||
    cookieToken.length !== headerToken.length
  ) {
    return next(
      new AppError("CSRF token missing or invalid", 403, "CSRF_TOKEN_INVALID"),
    );
  }
  const valid = crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(headerToken),
  );
  if (!valid)
    return next(
      new AppError("CSRF token missing or invalid", 403, "CSRF_TOKEN_INVALID"),
    );
  next();
}
