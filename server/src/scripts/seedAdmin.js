import "dotenv/config";
import mongoose from "mongoose";
import User from "../models/User.js";
import { connectDB } from "../config/db.js";
await connectDB();
const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
if (
  !ADMIN_NAME ||
  !ADMIN_EMAIL ||
  !ADMIN_PASSWORD ||
  ADMIN_PASSWORD.length < 12
) {
  console.error(
    "Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD (12+ chars) in .env",
  );
  process.exitCode = 1;
} else {
  const email = ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    console.log("Admin email already exists; no changes made.");
  } else {
    await User.create({
      name: ADMIN_NAME,
      email,
      password: ADMIN_PASSWORD,
      role: "admin",
    });
    console.log(`Admin created: ${email}`);
  }
}
await mongoose.disconnect();
