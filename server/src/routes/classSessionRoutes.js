import { Router } from "express";
import {
  bookClassSeat,
  listClassSessions,
  myClassBookings,
} from "../controllers/classSessionController.js";
import { protect } from "../middleware/auth.js";
const router = Router();
router.get("/", listClassSessions);
router.get("/my-bookings", protect, myClassBookings);
router.post("/:classId/seats/:seatNumber/book", protect, bookClassSeat);
export default router;
