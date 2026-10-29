import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";
export const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
export const signAccess = (user, sessionId) =>
  jwt.sign(
    { sub: user._id.toString(), role: user.role, sid: sessionId },
    env.accessSecret,
    {
      expiresIn: env.accessTtl,
      issuer: "divine-vikas",
      audience: "divine-vikas-api",
    },
  );
export const signRefresh = (user, sessionId, jti) =>
  jwt.sign(
    { sub: user._id.toString(), sid: sessionId, jti, type: "refresh" },
    env.refreshSecret,
    {
      expiresIn: `${env.refreshDays}d`,
      issuer: "divine-vikas",
      audience: "divine-vikas-api",
    },
  );
export const verifyAccess = (token) =>
  jwt.verify(token, env.accessSecret, {
    issuer: "divine-vikas",
    audience: "divine-vikas-api",
  });
export const verifyRefresh = (token) =>
  jwt.verify(token, env.refreshSecret, {
    issuer: "divine-vikas",
    audience: "divine-vikas-api",
  });
export const randomId = () => crypto.randomUUID();
