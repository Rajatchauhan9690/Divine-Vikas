import User from "../models/User.js";
import Session from "../models/Session.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  issueSession,
  rotateSession,
  cookieOptions,
} from "../services/authService.js";
import { hashToken } from "../utils/tokens.js";
import { issueCsrfToken } from "../middleware/csrf.js";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import PasswordResetToken from "../models/PasswordResetToken.js";
import { sendPasswordResetEmail } from "../services/emailService.js";

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 5 * 60 * 1000;
const PASSWORD_RESET_RESEND_MS = 60 * 1000;
const MAX_PASSWORD_RESET_ATTEMPTS = 5;
const PASSWORD_RESET_RESPONSE = {
  success: true,
  message: "If the account exists, a reset code has been sent to its email.",
};

function hashPasswordResetOtp(email, otp) {
  return createHmac("sha256", process.env.REFRESH_TOKEN_SECRET)
    .update(`${email}:${otp}`)
    .digest("hex");
}

function isMatchingOtp(storedHash, candidateHash) {
  const stored = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");
  return (
    stored.length === candidate.length && timingSafeEqual(stored, candidate)
  );
}

function ensurePasswordResetDeliveryConfigured() {
  const emailConfigured =
    process.env.SMTP_HOST &&
    process.env.SMTP_FROM &&
    Boolean(process.env.SMTP_USER) === Boolean(process.env.SMTP_PASSWORD);
  if (!emailConfigured)
    throw new AppError(
      "Password reset delivery is not configured. Please contact support.",
      503,
      "PASSWORD_RESET_DELIVERY_NOT_CONFIGURED",
    );
}

function genericPasswordResetError() {
  return new AppError(
    "The reset code is invalid or has expired. Request a new code and try again.",
    400,
    "INVALID_PASSWORD_RESET_CODE",
  );
}

export const csrf = asyncHandler(async (_req, res) => {
  const csrfToken = issueCsrfToken(_req, res);
  res.json({ success: true, csrfToken });
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (
    !name?.trim() ||
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length < 8
  )
    throw new AppError(
      "Name, valid email and password (8+ characters) are required",
      400,
      "INVALID_INPUT",
    );
  if (await User.exists({ email: email.toLowerCase().trim() }))
    throw new AppError(
      "An account with this email already exists",
      409,
      "EMAIL_EXISTS",
    );
  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role: "customer",
  });
  res
    .status(201)
    .json({ success: true, ...(await issueSession(user, req, res)) });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  )
    throw new AppError("Email and password are required", 400, "INVALID_INPUT");
  const normalizedEmail = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+password +failedLoginAttempts +lockUntil",
  );
  // Same public error for unknown users and incorrect passwords to reduce account enumeration.
  if (!user)
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  if (user.lockUntil && user.lockUntil > new Date()) {
    res.setHeader(
      "Retry-After",
      String(Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000)),
    );
    throw new AppError(
      "Account temporarily locked due to repeated failed login attempts",
      423,
      "ACCOUNT_LOCKED",
    );
  }
  if (user.lockUntil && user.lockUntil <= new Date()) {
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
  }
  const passwordMatches = await user.comparePassword(password);
  if (!passwordMatches || !user.active) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS)
      user.lockUntil = new Date(Date.now() + LOCKOUT_MS);
    await user.save();
    if (user.lockUntil)
      res.setHeader("Retry-After", String(Math.ceil(LOCKOUT_MS / 1000)));
    throw new AppError(
      user.lockUntil
        ? "Account temporarily locked due to repeated failed login attempts"
        : "Invalid email or password",
      user.lockUntil ? 423 : 401,
      user.lockUntil ? "ACCOUNT_LOCKED" : "INVALID_CREDENTIALS",
    );
  }
  user.failedLoginAttempts = 0;
  user.lockUntil = null;
  await user.save();
  res.json({ success: true, ...(await issueSession(user, req, res)) });
});

export const refresh = asyncHandler(async (req, res) =>
  res.json({ success: true, ...(await rotateSession(req, res)) }),
);

export const requestPasswordReset = asyncHandler(async (req, res) => {
  const email =
    typeof req.body.email === "string"
      ? req.body.email.toLowerCase().trim()
      : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new AppError("Enter a valid email address", 400, "INVALID_INPUT");

  ensurePasswordResetDeliveryConfigured();
  const user = await User.findOne({ email, active: true });
  if (!user) return res.status(202).json(PASSWORD_RESET_RESPONSE);

  const now = new Date();
  const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const tokenData = {
    otpHash: hashPasswordResetOtp(email, otp),
    attempts: 0,
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
    lastSentAt: now,
    consumedAt: null,
  };
  const cutoff = new Date(now.getTime() - PASSWORD_RESET_RESEND_MS);
  let resetToken;
  const currentToken = await PasswordResetToken.findOne({ user: user._id });
  if (currentToken) {
    resetToken = await PasswordResetToken.findOneAndUpdate(
      { _id: currentToken._id, lastSentAt: { $lte: cutoff } },
      { $set: tokenData },
      { new: true },
    );
    if (!resetToken) return res.status(202).json(PASSWORD_RESET_RESPONSE);
  } else {
    try {
      resetToken = await PasswordResetToken.create({
        user: user._id,
        ...tokenData,
      });
    } catch (error) {
      if (error.code === 11000)
        return res.status(202).json(PASSWORD_RESET_RESPONSE);
      throw error;
    }
  }

  try {
    await sendPasswordResetEmail(email, otp);
  } catch (error) {
    await PasswordResetToken.deleteOne({ _id: resetToken._id });
    console.error("Password reset email delivery failed", {
      code: error.code || "SMTP_SEND_FAILED",
    });
    throw new AppError(
      "We could not deliver the reset code by email. Please try again later.",
      503,
      "PASSWORD_RESET_DELIVERY_FAILED",
    );
  }

  return res.status(202).json(PASSWORD_RESET_RESPONSE);
});

export const confirmPasswordReset = asyncHandler(async (req, res) => {
  const email =
    typeof req.body.email === "string"
      ? req.body.email.toLowerCase().trim()
      : "";
  const { otp, password } = req.body;
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof otp !== "string" ||
    !/^\d{6}$/.test(otp) ||
    typeof password !== "string" ||
    password.length < 8
  )
    throw new AppError(
      "Enter a valid email, six-digit code, and password of at least 8 characters",
      400,
      "INVALID_INPUT",
    );

  const user = await User.findOne({ email, active: true });
  if (!user) throw genericPasswordResetError();

  const now = new Date();
  const resetToken = await PasswordResetToken.findOne({
    user: user._id,
    expiresAt: { $gt: now },
    consumedAt: null,
    attempts: { $lt: MAX_PASSWORD_RESET_ATTEMPTS },
  });
  if (!resetToken) throw genericPasswordResetError();

  const candidateHash = hashPasswordResetOtp(email, otp);
  if (!isMatchingOtp(resetToken.otpHash, candidateHash)) {
    await PasswordResetToken.updateOne(
      {
        _id: resetToken._id,
        expiresAt: { $gt: now },
        consumedAt: null,
        attempts: { $lt: MAX_PASSWORD_RESET_ATTEMPTS },
      },
      { $inc: { attempts: 1 } },
    );
    throw genericPasswordResetError();
  }

  const claimed = await PasswordResetToken.findOneAndUpdate(
    {
      _id: resetToken._id,
      otpHash: candidateHash,
      expiresAt: { $gt: now },
      consumedAt: null,
      attempts: { $lt: MAX_PASSWORD_RESET_ATTEMPTS },
    },
    { $set: { consumedAt: now } },
    { new: true },
  );
  if (!claimed) throw genericPasswordResetError();

  const account = await User.findById(user._id).select(
    "+password +failedLoginAttempts +lockUntil",
  );
  if (!account?.active) throw genericPasswordResetError();
  account.password = password;
  account.failedLoginAttempts = 0;
  account.lockUntil = null;
  await account.save();
  await Session.updateMany(
    { user: account._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  res.clearCookie("refreshToken", {
    ...cookieOptions(),
    maxAge: undefined,
  });
  return res.json({
    success: true,
    message: "Password updated. Please sign in with your new password.",
  });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies.refreshToken;
  if (token)
    await Session.updateOne(
      { refreshHash: hashToken(token), revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  res.clearCookie("refreshToken", { ...cookieOptions(), maxAge: undefined });
  res.json({ success: true, message: "Signed out" });
});
export const me = asyncHandler(async (req, res) =>
  res.json({
    success: true,
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  }),
);
export const logoutAll = asyncHandler(async (req, res) => {
  await Session.updateMany(
    { user: req.user._id, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  res.clearCookie("refreshToken", { ...cookieOptions(), maxAge: undefined });
  res.json({ success: true, message: "All sessions revoked" });
});
