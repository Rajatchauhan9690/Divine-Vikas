import { Router } from "express";
import {
  dashboard,
  createOrderShipment,
  listOrderCouriers,
  listAdminOrders,
  listAdminProducts,
  retryOrderWhatsApp,
} from "../controllers/adminController.js";
import {
  adminCancelOrder,
  adminUpdateOrderReturn,
} from "../controllers/orderController.js";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "../controllers/productController.js";
import { protect, authorize } from "../middleware/auth.js";
import {
  createClassSession,
  deleteClassSession,
  updateClassSession,
  updateClassSessionPrice,
} from "../controllers/classSessionController.js";
import { uploadProductImage } from "../middleware/productImageUpload.js";
const r = Router();
r.use(protect, authorize("admin"));
r.get("/dashboard", dashboard);
r.get("/products", listAdminProducts);
r.get("/orders", listAdminOrders);
r.post("/orders/:orderId/cancel", adminCancelOrder);
r.patch("/orders/:orderId/return", adminUpdateOrderReturn);
r.get("/orders/:orderId/couriers", listOrderCouriers);
r.post("/orders/:orderId/shipment", createOrderShipment);
r.post("/orders/:orderId/whatsapp/retry", retryOrderWhatsApp);
r.post("/classes", createClassSession);
r.put("/classes/:classId", updateClassSession);
r.delete("/classes/:classId", deleteClassSession);
r.patch("/classes/:classId/price", updateClassSessionPrice);
r.post("/products", uploadProductImage, createProduct);
r.put("/products/:id", uploadProductImage, updateProduct);
r.delete("/products/:id", deleteProduct);
export default r;
