import AppError from "../utils/AppError.js";

export function requireActiveSubAdminSubscription(req, _res, next) {
  if (req.user?.role !== "sub_admin") return next();
  const subscription = req.user.subscription;
  const now = new Date();
  const active =
    subscription?.status === "active" &&
    subscription.currentPeriodEnd > now;
  if (active) return next();
  return next(
    new AppError(
      "An active subscription is required to manage appointment services",
      402,
      "SUBSCRIPTION_REQUIRED",
    ),
  );
}