import { Router } from "express";
import {
  createOrder,
  myOrders,
  cancelMyOrder,
  getOrder,
  updateMyOrderAddress,
  adminUpdateOrder,
  requestOrderReturn,
  verifyCashfreePayment,
} from "../controllers/orderController.js";
import { protect, authorize } from "../middleware/auth.js";
const r = Router();
r.use(protect);
r.post("/", createOrder);
r.get("/mine", myOrders);
r.post("/:orderId/cancel", cancelMyOrder);
r.post("/:orderId/return", requestOrderReturn);
r.get("/:orderId", getOrder);
r.patch("/:orderId/address", updateMyOrderAddress);
r.post("/:orderId/verify-payment", verifyCashfreePayment);
r.patch("/:orderId/status", authorize("admin"), adminUpdateOrder);
export default r;
