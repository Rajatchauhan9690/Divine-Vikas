import { Router } from "express";
import {
  createOrder,
  myOrders,
  cancelMyOrder,
  getOrder,
  adminUpdateOrder,
  requestOrderReturn,
  quoteOrderShipping,
  verifyCashfreePayment,
} from "../controllers/orderController.js";
import {
  issueOfferingGameReward,
  searchCoupons,
  validateCoupon,
} from "../controllers/couponController.js";
import { protect, authorize } from "../middleware/auth.js";
const r = Router();
r.use(protect);
r.patch("/:orderId/status", authorize("admin"), adminUpdateOrder);
r.post("/coupons/game-reward", authorize("customer"), issueOfferingGameReward);
r.use(authorize("customer", "sub_admin"));
r.post("/shipping-quotes", quoteOrderShipping);
r.post("/coupons/search", searchCoupons);
r.post("/coupons/validate", validateCoupon);
r.post("/", createOrder);
r.get("/mine", myOrders);
r.post("/:orderId/cancel", cancelMyOrder);
r.post("/:orderId/return", requestOrderReturn);
r.get("/:orderId", getOrder);
r.post("/:orderId/verify-payment", verifyCashfreePayment);
export default r;
