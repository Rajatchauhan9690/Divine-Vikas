import { Router } from "express";
import {
  createOrder,
  myOrders,
  cancelMyOrder,
  getOrder,
  adminUpdateOrder,
  requestOrderReturn,
  verifyCashfreePayment,
} from "../controllers/orderController.js";
import { protect, authorize } from "../middleware/auth.js";
const r = Router();
r.use(protect);
r.patch("/:orderId/status", authorize("admin"), adminUpdateOrder);
r.use(authorize("customer", "sub_admin"));
r.post("/", createOrder);
r.get("/mine", myOrders);
r.post("/:orderId/cancel", cancelMyOrder);
r.post("/:orderId/return", requestOrderReturn);
r.get("/:orderId", getOrder);
r.post("/:orderId/verify-payment", verifyCashfreePayment);
export default r;
