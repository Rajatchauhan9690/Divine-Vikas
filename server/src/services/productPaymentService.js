import Order from "../models/Order.js";
import Product from "../models/Product.js";
import ProductPaymentAttempt from "../models/ProductPaymentAttempt.js";
import { notifyOrderConfirmation } from "./emailNotificationService.js";

function queueOrderConfirmationEmail(orderId) {
  void notifyOrderConfirmation(orderId).catch((error) =>
    console.error("Could not process order confirmation email", {
      orderId: String(orderId),
      code: error.code || "EMAIL_SEND_FAILED",
    }),
  );
}

async function restoreInventory(attempt) {
  for (const item of attempt.items) {
    const restored = await Product.updateOne(
      { _id: item.product },
      { $inc: { stock: item.quantity } },
    );
    if (!restored.modifiedCount)
      throw new Error(
        `Could not restore reserved inventory for ${item.name} (${item.product})`,
      );
  }
}

export async function releaseProductPaymentAttempt(attempt, status) {
  const claimed = await ProductPaymentAttempt.findOneAndUpdate(
    {
      _id: attempt._id,
      status: "pending",
      inventoryReleasedAt: null,
    },
    { $set: { status: "releasing" } },
    { new: true },
  );
  if (!claimed) return false;
  await restoreInventory(claimed);
  await ProductPaymentAttempt.updateOne(
    { _id: claimed._id, status: "releasing" },
    {
      $set: {
        status,
        paymentStatus: status === "failed" ? "failed" : claimed.paymentStatus,
        inventoryReleasedAt: new Date(),
      },
    },
  );
  return true;
}

export async function releaseExpiredProductPaymentAttempts() {
  const expired = await ProductPaymentAttempt.find({
    status: "pending",
    expiresAt: { $lte: new Date() },
    inventoryReleasedAt: null,
  })
    .select("_id")
    .lean();
  for (const { _id } of expired) {
    const attempt = await ProductPaymentAttempt.findById(_id);
    if (attempt) await releaseProductPaymentAttempt(attempt, "expired");
  }
}

async function reserveInventory(items) {
  const reserved = [];
  for (const item of items) {
    const result = await Product.updateOne(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
    );
    if (!result.modifiedCount) {
      for (const previous of reserved)
        await Product.updateOne(
          { _id: previous.product },
          { $inc: { stock: previous.quantity } },
        );
      return false;
    }
    reserved.push(item);
  }
  return true;
}

export async function createOrderForPaidAttempt(attempt, paymentId) {
  if (attempt.order) {
    const existingOrder = await Order.findById(attempt.order);
    if (existingOrder) queueOrderConfirmationEmail(existingOrder._id);
    return existingOrder;
  }
  const existingOrder = await Order.findOne({
    "payment.providerOrderId": attempt.providerOrderId,
  });
  if (existingOrder) {
    await ProductPaymentAttempt.updateOne(
      { _id: attempt._id },
      {
        $set: {
          status: "order_created",
          paymentStatus: "paid",
          cfPaymentId: String(paymentId || ""),
          order: existingOrder._id,
        },
      },
    );
    queueOrderConfirmationEmail(existingOrder._id);
    return existingOrder;
  }

  const claimed = await ProductPaymentAttempt.findOneAndUpdate(
    {
      _id: attempt._id,
      status: { $in: ["pending", "expired", "failed"] },
      order: null,
    },
    {
      $set: {
        status: "processing",
        paymentStatus: "paid",
        cfPaymentId: String(paymentId || ""),
      },
    },
    { new: true },
  );
  if (!claimed) {
    const latest = await ProductPaymentAttempt.findById(attempt._id);
    return latest?.order ? Order.findById(latest.order) : null;
  }

  if (claimed.inventoryReleasedAt) {
    const inventoryReserved = await reserveInventory(claimed.items);
    if (!inventoryReserved) {
      await ProductPaymentAttempt.updateOne(
        { _id: claimed._id, status: "processing" },
        { $set: { status: "refund_required" } },
      );
      return null;
    }
    await ProductPaymentAttempt.updateOne(
      { _id: claimed._id, status: "processing" },
      { $set: { inventoryReleasedAt: null } },
    );
  }

  let order;
  try {
    order = await Order.create({
      user: claimed.user,
      items: claimed.items,
      total: claimed.total,
      shippingAddress: claimed.shippingAddress,
      paymentMethod: "cashfree",
      paymentStatus: "paid",
      status: "paid",
      payment: {
        providerOrderId: claimed.providerOrderId,
        paymentSessionId: claimed.paymentSessionId,
        cfPaymentId: String(paymentId || ""),
        paidAt: new Date(),
      },
      statusHistory: [
        {
          status: "paid",
          note: "Cashfree payment verified; order created",
          by: claimed.user,
        },
      ],
    });
  } catch (error) {
    await ProductPaymentAttempt.updateOne(
      { _id: claimed._id, status: "processing" },
      { $set: { status: "pending" } },
    );
    throw error;
  }
  await ProductPaymentAttempt.updateOne(
    { _id: claimed._id, status: "processing" },
    { $set: { status: "order_created", order: order._id } },
  );
  queueOrderConfirmationEmail(order._id);
  return order;
}

export async function processProductPaymentFailure(attempt) {
  if (attempt.status !== "pending") return;
  await releaseProductPaymentAttempt(attempt, "failed");
}
