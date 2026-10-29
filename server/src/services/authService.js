import User from "../models/User.js";
import Session from "../models/Session.js";
import AppError from "../utils/AppError.js";
import {
  hashToken,
  signAccess,
  signRefresh,
  randomId,
  verifyRefresh,
} from "../utils/tokens.js";
import { env } from "../config/env.js";
import crypto from "node:crypto";
export const cookieOptions = () => ({
  httpOnly: true,
  secure: env.nodeEnv === "production",
  sameSite: env.sameSite,
  path: "/api/auth",
  maxAge: env.refreshDays * 86400000,
});
export async function issueSession(user, req, res) {
  const sid = randomId(),
    jti = randomId(),
    refresh = signRefresh(user, sid, jti),
    hash = hashToken(refresh);
  await Session.create({
    user: user._id,
    sessionId: sid,
    refreshHash: hash,
    expiresAt: new Date(Date.now() + env.refreshDays * 86400000),
    userAgent: req.get("user-agent") || "",
    ip: req.ip,
  });
  res.cookie("refreshToken", refresh, cookieOptions());
  return {
    accessToken: signAccess(user, sid),
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  };
}
export async function rotateSession(req, res) {
  const token = req.cookies.refreshToken;
  if (!token)
    throw new AppError("Refresh token missing", 401, "MISSING_REFRESH_TOKEN");
  let payload;
  try {
    payload = verifyRefresh(token);
  } catch {
    res.clearCookie("refreshToken", { ...cookieOptions(), maxAge: undefined });
    throw new AppError(
      "Refresh token is invalid or expired",
      401,
      "INVALID_REFRESH_TOKEN",
    );
  }
  if (payload.type !== "refresh")
    throw new AppError("Invalid token type", 401, "INVALID_REFRESH_TOKEN");

  const oldHash = hashToken(token);
  const now = new Date();
  // Atomically claim the old token. Only one concurrent request can rotate it.
  const old = await Session.findOneAndUpdate(
    {
      refreshHash: oldHash,
      sessionId: payload.sid,
      user: payload.sub,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    { $set: { revokedAt: now } },
    { new: false },
  );
  if (!old) {
    await Session.updateMany(
      { sessionId: payload.sid, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    res.clearCookie("refreshToken", { ...cookieOptions(), maxAge: undefined });
    throw new AppError(
      "Refresh token reuse detected; session revoked",
      401,
      "REFRESH_REUSE",
    );
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.active) {
    await Session.updateMany(
      { sessionId: payload.sid, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    res.clearCookie("refreshToken", { ...cookieOptions(), maxAge: undefined });
    throw new AppError("Account unavailable", 401, "ACCOUNT_UNAVAILABLE");
  }
  const jti = randomId();
  const nextToken = signRefresh(user, payload.sid, jti);
  const nextHash = hashToken(nextToken);
  try {
    await Session.create({
      user: user._id,
      sessionId: payload.sid,
      refreshHash: nextHash,
      expiresAt: new Date(Date.now() + env.refreshDays * 86400000),
      userAgent: req.get("user-agent") || "",
      ip: req.ip,
    });
  } catch (error) {
    await Session.updateMany(
      { sessionId: payload.sid, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    throw error;
  }
  await Session.updateOne(
    { _id: old._id },
    { $set: { replacedByHash: nextHash } },
  );
  res.cookie("refreshToken", nextToken, cookieOptions());
  return {
    accessToken: signAccess(user, payload.sid),
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  };
}
