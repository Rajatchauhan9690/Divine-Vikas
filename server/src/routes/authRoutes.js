import { Router } from "express";
import {
  register,
  login,
  refresh,
  logout,
  me,
  logoutAll,
  csrf,
  requestPasswordReset,
  confirmPasswordReset,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";
import {
  authLimiter,
  loginLimiter,
  refreshLimiter,
  passwordResetRequestLimiter,
  passwordResetVerificationLimiter,
} from "../middleware/rateLimits.js";
import { csrfProtection } from "../middleware/csrf.js";
const router = Router();
router.get("/csrf", csrf);
router.post("/register", authLimiter, csrfProtection, register);
router.post("/login", authLimiter, loginLimiter, csrfProtection, login);
router.post("/refresh", csrfProtection, refreshLimiter, refresh);
router.post(
  "/password-reset/request",
  passwordResetRequestLimiter,
  csrfProtection,
  requestPasswordReset,
);
router.post(
  "/password-reset/confirm",
  passwordResetVerificationLimiter,
  csrfProtection,
  confirmPasswordReset,
);
router.post("/logout", csrfProtection, logout);
router.get("/me", protect, me);
router.post("/logout-all", protect, csrfProtection, logoutAll);
export default router;
