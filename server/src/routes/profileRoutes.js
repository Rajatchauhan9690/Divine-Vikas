import { Router } from "express";
import { protect } from "../middleware/auth.js";
import {
  getProfile,
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from "../controllers/profileController.js";
const r = Router();
r.use(protect);
r.get("/", getProfile);
r.patch("/", updateProfile);
r.post("/addresses", addAddress);
r.patch("/addresses/:addressId", updateAddress);
r.delete("/addresses/:addressId", deleteAddress);
r.post("/addresses/:addressId/default", setDefaultAddress);
export default r;
