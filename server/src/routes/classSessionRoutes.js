import { Router } from "express";
import {
  listClassSessions,
  myClassPaymentHolds,
  myClassBookings,
  resumeClassOrderPayment,
  reserveClassSeat,
  reserveClassSeats,
  verifyClassOrderPayment,
  verifyClassSeatPayment,
} from "../controllers/classSessionController.js";
import { protect } from "../middleware/auth.js";
import { classBookingRateLimiter } from "../middleware/rateLimits.js";
const router = Router();
router.get("/", listClassSessions);
router.get("/my-payment-holds", protect, myClassPaymentHolds);
router.get("/my-bookings", protect, myClassBookings);
router.post(
  "/:classId/payments/:paymentOrderId/resume",
  protect,
  resumeClassOrderPayment,
);
router.post(
  "/:classId/seats/payment",
  protect,
  classBookingRateLimiter,
  reserveClassSeats,
);
router.post(
  "/:classId/payments/:paymentOrderId/verify",
  protect,
  verifyClassOrderPayment,
);
router.post(
  "/:classId/seats/:seatNumber/payment",
  protect,
  classBookingRateLimiter,
  reserveClassSeat,
);
router.post(
  "/:classId/seats/:seatNumber/verify-payment",
  protect,
  verifyClassSeatPayment,
);
export default router;
