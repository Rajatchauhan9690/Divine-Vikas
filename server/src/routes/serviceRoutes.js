import { Router } from "express";
import {
  cancelClassOrderPayment,
  reserveServiceSlot,
  verifyServiceOrderPayment,
} from "../controllers/classSessionController.js";
import { listServiceSessions } from "../controllers/serviceController.js";
import { authorize, protect } from "../middleware/auth.js";
import { classBookingRateLimiter } from "../middleware/rateLimits.js";

const router = Router();
const optionalProtect = (req, res, next) => {
  if (!req.headers.authorization) return next();
  return protect(req, res, next);
};
router.get("/", optionalProtect, listServiceSessions);
router.use(protect, authorize("customer", "sub_admin"));
router.post(
  "/:serviceId/slots/:slotId/payment",
  classBookingRateLimiter,
  reserveServiceSlot,
);
router.post(
  "/:serviceId/payments/:paymentOrderId/verify",
  verifyServiceOrderPayment,
);
router.post(
  "/:serviceId/payments/:paymentOrderId/cancel",
  cancelClassOrderPayment,
);
export default router;
