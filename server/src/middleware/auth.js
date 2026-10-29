import { verifyAccess } from "../utils/tokens.js";
import User from "../models/User.js";
import Session from "../models/Session.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer "))
    throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
  let payload;
  try {
    payload = verifyAccess(header.slice(7));
  } catch {
    throw new AppError(
      "Access token is invalid or expired",
      401,
      "INVALID_ACCESS_TOKEN",
    );
  }
  const session = await Session.findOne({
    sessionId: payload.sid,
    user: payload.sub,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session)
    throw new AppError(
      "Session has expired or been revoked",
      401,
      "SESSION_REVOKED",
    );
  const user = await User.findById(payload.sub);
  if (!user || !user.active)
    throw new AppError("Account unavailable", 401, "ACCOUNT_UNAVAILABLE");
  req.user = user;
  req.session = session;
  next();
});
export const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return next(
        new AppError(
          "You do not have permission to perform this action",
          403,
          "FORBIDDEN",
        ),
      );
    next();
  };
