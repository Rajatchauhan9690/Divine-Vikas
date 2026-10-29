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

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

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
