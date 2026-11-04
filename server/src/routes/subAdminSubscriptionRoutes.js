import { Router } from "express";
import {
  createSubAdminRenewal,
  getCurrentSubAdminSubscription,
  verifySubAdminRenewal,
} from "../controllers/subAdminSubscriptionController.js";
import { protect, authorize } from "../middleware/auth.js";
import { csrfProtection } from "../middleware/csrf.js";
import { authLimiter } from "../middleware/rateLimits.js";

const router = Router();
router.use(protect, authorize("sub_admin"));
router.get("/me", getCurrentSubAdminSubscription);
router.post("/renewal", authLimiter, csrfProtection, createSubAdminRenewal);
router.post(
  "/renewal/:attemptId/verify",
  authLimiter,
  csrfProtection,
  verifySubAdminRenewal,
);
export default router;