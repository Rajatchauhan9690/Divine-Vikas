import app from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
import { releaseExpiredProductPaymentAttempts } from "./services/productPaymentService.js";
await connectDB();
let paymentCleanupRunning = false;
const cleanupExpiredPayments = async () => {
  if (paymentCleanupRunning) return;
  paymentCleanupRunning = true;
  try {
    await releaseExpiredProductPaymentAttempts();
  } catch (error) {
    console.error("Could not release expired product payment reservations", error);
  } finally {
    paymentCleanupRunning = false;
  }
};
const paymentCleanupTimer = setInterval(cleanupExpiredPayments, 30_000);
paymentCleanupTimer.unref();
cleanupExpiredPayments();
const server = app.listen(env.port, () =>
  console.log(`API listening on port ${env.port}`),
);
const shutdown = (signal) => {
  console.log(`${signal}: shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection", err);
  shutdown("unhandledRejection");
});
