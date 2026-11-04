import { Router } from "express";
import {
  listClassSessions,
  myClassPaymentHolds,
  myClassBookings,
  cancelClassOrderPayment,
  resumeClassOrderPayment,
  reserveClassSeat,
  reserveClassSeats,
  verifyClassOrderPayment,
  verifyClassSeatPayment,
} from "../controllers/classSessionController.js";
import { authorize, protect } from "../middleware/auth.js";
import { classBookingRateLimiter } from "../middleware/rateLimits.js";
const router = Router();
router.get("/", listClassSessions);
router.use(protect, authorize("customer", "sub_admin"));
router.get("/my-payment-holds", myClassPaymentHolds);
router.get("/my-bookings", myClassBookings);
router.post(
  "/:classId/payments/:paymentOrderId/cancel",
  cancelClassOrderPayment,
);
router.post(
  "/:classId/payments/:paymentOrderId/resume",
  resumeClassOrderPayment,
);
router.post(
  "/:classId/seats/payment",
  classBookingRateLimiter,
  reserveClassSeats,
);
router.post(
  "/:classId/payments/:paymentOrderId/verify",
  verifyClassOrderPayment,
);
router.post(
  "/:classId/seats/:seatNumber/payment",
  classBookingRateLimiter,
  reserveClassSeat,
);
router.post(
  "/:classId/seats/:seatNumber/verify-payment",
  verifyClassSeatPayment,
);
export default router;
