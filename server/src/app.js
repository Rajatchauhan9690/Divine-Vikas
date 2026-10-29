import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import compression from "compression";
import morgan from "morgan";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { apiLimiter } from "./middleware/rateLimits.js";
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import { cashfreeWebhook } from "./controllers/orderController.js";
import classSessionRoutes from "./routes/classSessionRoutes.js";
import { notFound, errorHandler } from "./middleware/errors.js";
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.nodeEnv === "production" ? 1 : false);
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
});
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        imgSrc: [
          "'self'",
          "data:",
          "https://images.unsplash.com",
          ...env.imageOrigins,
        ],
      },
    },
  }),
);
app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-Id",
      "X-CSRF-Token",
    ],
  }),
);
app.use(compression());
app.post(
  "/api/orders/cashfree/webhook",
  express.raw({ type: "application/json", limit: "100kb" }),
  cashfreeWebhook,
);
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(cookieParser());
if (env.nodeEnv !== "test")
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
app.get("/health", (req, res) =>
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
  }),
);
app.use(
  "/uploads",
  express.static(fileURLToPath(new URL("../uploads/", import.meta.url)), {
    setHeaders: (res) =>
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"),
  }),
);
app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/classes", classSessionRoutes);
app.use(notFound);
app.use(errorHandler);
export default app;
