import { Router } from "express";
import {
  dashboard,
  createOrderShipment,
  listOrderCouriers,
  listAdminOrders,
  listAdminProducts,
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
  createService,
  deleteService,
  listAdminServices,
  listServiceBookings,
  listSubAdminAppointments,
  updateService,
} from "../controllers/serviceController.js";
import {
  createSubAdminInvitation,
  getAdminSubAdminSubscriptionPlans,
  listSubAdminInvitations,
  updateAdminSubAdminSubscriptionPlans,
} from "../controllers/subAdminInvitationController.js";
import {
  createClassSession,
  deleteClassSession,
  listAdminClassSessions,
  updateClassSession,
  updateClassSessionPrice,
} from "../controllers/classSessionController.js";
import { uploadProductImage } from "../middleware/productImageUpload.js";
import { requireActiveSubAdminSubscription } from "../middleware/subAdminSubscription.js";
const r = Router();
r.use(protect);
const adminOnly = authorize("admin");
const serviceManagers = [
  authorize("admin", "sub_admin"),
  requireActiveSubAdminSubscription,
];
r.get("/dashboard", adminOnly, dashboard);
r.get("/products", adminOnly, listAdminProducts);
r.get("/orders", adminOnly, listAdminOrders);
r.post("/orders/:orderId/cancel", adminOnly, adminCancelOrder);
r.patch("/orders/:orderId/return", adminOnly, adminUpdateOrderReturn);
r.get("/orders/:orderId/couriers", adminOnly, listOrderCouriers);
r.post("/orders/:orderId/shipment", adminOnly, createOrderShipment);
r.get("/classes", adminOnly, listAdminClassSessions);
r.post("/classes", adminOnly, createClassSession);
r.put("/classes/:classId", adminOnly, updateClassSession);
r.delete("/classes/:classId", adminOnly, deleteClassSession);
r.patch("/classes/:classId/price", adminOnly, updateClassSessionPrice);
r.get("/services", ...serviceManagers, listAdminServices);
r.get("/service-bookings", ...serviceManagers, listServiceBookings);
r.get("/sub-admins/:subAdminId/appointments", adminOnly, listSubAdminAppointments);
r.post("/services", ...serviceManagers, createService);
r.put("/services/:serviceId", ...serviceManagers, updateService);
r.delete("/services/:serviceId", ...serviceManagers, deleteService);
r.get("/sub-admin-invitations", adminOnly, listSubAdminInvitations);
r.post("/sub-admin-invitations", adminOnly, createSubAdminInvitation);
r.get("/sub-admin-subscription-plans", adminOnly, getAdminSubAdminSubscriptionPlans);
r.put("/sub-admin-subscription-plans", adminOnly, updateAdminSubAdminSubscriptionPlans);
r.post("/products", adminOnly, uploadProductImage, createProduct);
r.put("/products/:id", adminOnly, uploadProductImage, updateProduct);
r.delete("/products/:id", adminOnly, deleteProduct);
export default r;
