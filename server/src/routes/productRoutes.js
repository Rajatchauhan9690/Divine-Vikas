import { Router } from "express";
import { listProducts, getProduct } from "../controllers/productController.js";
const r = Router();
r.get("/", listProducts);
r.get("/:id", getProduct);
export default r;
