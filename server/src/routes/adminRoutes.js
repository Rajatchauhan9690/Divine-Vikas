import { Router } from "express";
import { dashboard } from "../controllers/adminController.js";
import {
  createProduct,
  deleteProduct,
} from "../controllers/productController.js";
import { protect, authorize } from "../middleware/auth.js";
import { createClassSession } from "../controllers/classSessionController.js";
import { uploadProductImage } from "../middleware/productImageUpload.js";
const r = Router();
r.use(protect, authorize("admin"));
r.get("/dashboard", dashboard);
r.post("/classes", createClassSession);
r.post("/products", uploadProductImage, createProduct);
r.delete("/products/:id", deleteProduct);
export default r;
