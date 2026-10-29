import crypto from "node:crypto";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const cashfreeBase = () =>
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
function validAddress(a) {
  return (
    a &&
    ["fullName", "phone", "line1", "city", "state", "postalCode"].every(
      (k) => typeof a[k] === "string" && a[k].trim(),
    ) &&
    /^\+?[0-9 ()-]{8,20}$/.test(a.phone)
  );
}
async function cashfreeRequest(path, body) {
  if (!process.env.CASHFREE_CLIENT_ID || !process.env.CASHFREE_CLIENT_SECRET)
    throw new AppError(
      "Cashfree is not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET in server/.env",
      503,
      "PAYMENTS_NOT_CONFIGURED",
    );
  const response = await fetch(`${cashfreeBase()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-version": "2023-08-01",
      "x-client-id": process.env.CASHFREE_CLIENT_ID,
      "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new AppError(
      data.message || "Cashfree payment request failed",
      502,
      "CASHFREE_ERROR",
    );
  return data;
}
export const createOrder = asyncHandler(async (req, res) => {
  const raw = req.body.items;
  const address = req.body.shippingAddress;
  const paymentMethod =
    req.body.paymentMethod === "cashfree" ? "cashfree" : "cod";
  if (!validAddress(address))
    throw new AppError(
      "A valid shipping address is required",
      400,
      "INVALID_ADDRESS",
    );
  if (!Array.isArray(raw) || !raw.length || raw.length > 30)
    throw new AppError(
      "Add at least one item to your order",
      400,
      "INVALID_ORDER",
    );
  const ids = [...new Set(raw.map((i) => i.product))];
  const products = await Product.find({ _id: { $in: ids }, active: true });
  const byId = new Map(products.map((p) => [p._id.toString(), p]));
  const items = [];
  let total = 0;
  for (const item of raw) {
    const p = byId.get(String(item.product)),
      quantity = Number(item.quantity);
    if (!p || !Number.isInteger(quantity) || quantity < 1 || quantity > 20)
      throw new AppError("An order item is invalid", 400, "INVALID_ORDER_ITEM");
    if (p.stock < quantity)
      throw new AppError(
        `Not enough stock for ${p.name}`,
        409,
        "INSUFFICIENT_STOCK",
      );
    items.push({ product: p._id, name: p.name, price: p.price, quantity });
    total += p.price * quantity;
  }
  if (!Number.isFinite(total) || total <= 0)
    throw new AppError("Invalid order total", 400, "INVALID_ORDER");
  const reserved = [];
  for (const item of items) {
    const result = await Product.updateOne(
      { _id: item.product, stock: { $gte: item.quantity } },
      { $inc: { stock: -item.quantity } },
    );
    if (!result.modifiedCount) {
      for (const r of reserved)
        await Product.updateOne(
          { _id: r.product },
          { $inc: { stock: r.quantity } },
        );
      throw new AppError(
        `Stock changed for ${item.name}. Please retry`,
        409,
        "STOCK_RACE",
      );
    }
    reserved.push(item);
  }
  let order;
  try {
    order = await Order.create({
      user: req.user._id,
      items,
      total,
      shippingAddress: address,
      paymentMethod,
      paymentStatus: paymentMethod === "cashfree" ? "pending" : "not_required",
      status: paymentMethod === "cod" ? "processing" : "pending",
      statusHistory: [
        {
          status: paymentMethod === "cod" ? "processing" : "pending",
          note:
            paymentMethod === "cod"
              ? "Cash on Delivery order placed"
              : "Order created; awaiting payment",
          by: req.user._id,
        },
      ],
    });
    if (paymentMethod === "cashfree") {
      const user = await User.findById(req.user._id);
      const cf = await cashfreeRequest("/orders", {
        order_id: `DV${order._id.toString()}`,
        order_amount: Number(total.toFixed(2)),
        order_currency: "INR",
        customer_details: {
          customer_id: user._id.toString(),
          customer_name: address.fullName,
          customer_email: user.email,
          customer_phone: address.phone.replace(/[^0-9]/g, "").slice(-10),
        },
        order_meta: {
          return_url: `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/orders?payment=return&order_id=${order._id}`,
          notify_url: process.env.CASHFREE_WEBHOOK_URL || undefined,
        },
      });
      order.payment = {
        providerOrderId: cf.order_id,
        paymentSessionId: cf.payment_session_id,
      };
      await order.save();
      return res.status(201).json({
        success: true,
        order,
        payment: {
          provider: "cashfree",
          paymentSessionId: cf.payment_session_id,
          environment:
            process.env.CASHFREE_ENV === "production"
              ? "production"
              : "sandbox",
        },
      });
    }
  } catch (error) {
    if (order) await Order.deleteOne({ _id: order._id });
    for (const r of reserved)
      await Product.updateOne(
        { _id: r.product },
        { $inc: { stock: r.quantity } },
      );
    throw error;
  }
  res.status(201).json({ success: true, order });
});
export const myOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({ success: true, orders });
});
export const updateMyOrderAddress = asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.orderId,
    user: req.user._id,
  });
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (
    !["pending", "paid", "processing"].includes(order.status) ||
    !order.addressChangeAllowed
  )
    throw new AppError(
      "Delivery address can no longer be changed after shipment preparation",
      409,
      "ADDRESS_CHANGE_CLOSED",
    );
  if (!validAddress(req.body.shippingAddress))
    throw new AppError(
      "A valid shipping address is required",
      400,
      "INVALID_ADDRESS",
    );
  order.shippingAddress = req.body.shippingAddress;
  order.statusHistory.push({
    status: order.status,
    note: "Delivery address updated by customer",
    by: req.user._id,
  });
  await order.save();
  res.json({ success: true, order });
});
export const getOrder = asyncHandler(async (req, res) => {
  const query = { _id: req.params.orderId };
  if (req.user.role !== "admin") query.user = req.user._id;
  const order = await Order.findOne(query).populate("user", "name email");
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  res.json({ success: true, order });
});
export const adminUpdateOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  const allowed = [
    "pending",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];
  if (req.body.status && !allowed.includes(req.body.status))
    throw new AppError("Invalid order status", 400, "INVALID_ORDER_STATUS");
  if (req.body.status) {
    if (
      order.paymentMethod === "cashfree" &&
      req.body.status === "paid" &&
      order.paymentStatus !== "paid"
    )
      throw new AppError(
        "Only verified Cashfree confirmation can mark payment as paid",
        409,
        "PAYMENT_NOT_VERIFIED",
      );
    order.status = req.body.status;
    order.addressChangeAllowed = ["pending", "paid", "processing"].includes(
      order.status,
    );
    order.statusHistory.push({
      status: order.status,
      note: String(req.body.note || `Status updated to ${order.status}`).slice(
        0,
        300,
      ),
      by: req.user._id,
    });
  }
  if (req.body.courier !== undefined)
    order.tracking.courier = String(req.body.courier).slice(0, 100);
  if (req.body.trackingNumber !== undefined)
    order.tracking.trackingNumber = String(req.body.trackingNumber).slice(
      0,
      100,
    );
  if (req.body.trackingUrl !== undefined) {
    const u = String(req.body.trackingUrl);
    if (u && !/^https:\/\//i.test(u))
      throw new AppError(
        "Tracking URL must use HTTPS",
        400,
        "INVALID_TRACKING_URL",
      );
    order.tracking.trackingUrl = u;
  }
  if (order.status === "shipped") order.addressChangeAllowed = false;
  await order.save();
  res.json({ success: true, order });
});
export const cashfreeWebhook = asyncHandler(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const signature = req.headers["x-webhook-signature"];
  const timestamp = req.headers["x-webhook-timestamp"];
  if (!signature || !timestamp || !process.env.CASHFREE_CLIENT_SECRET)
    throw new AppError("Invalid webhook signature", 401, "INVALID_WEBHOOK");
  const expected = crypto
    .createHmac("sha256", process.env.CASHFREE_CLIENT_SECRET)
    .update(String(timestamp) + raw.toString("utf8"))
    .digest("base64");
  const a = Buffer.from(String(signature));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    throw new AppError("Invalid webhook signature", 401, "INVALID_WEBHOOK");
  const event = JSON.parse(raw.toString("utf8"));
  const cfOrderId = event.data?.order?.order_id;
  const paymentStatus = event.data?.payment?.payment_status;
  const paymentId = event.data?.payment?.cf_payment_id;
  if (!cfOrderId || !paymentStatus)
    return res.json({ success: true, ignored: true });
  const order = await Order.findOne({ "payment.providerOrderId": cfOrderId });
  if (!order) return res.json({ success: true, ignored: true });
  if (paymentStatus === "SUCCESS" && order.paymentStatus !== "paid") {
    order.paymentStatus = "paid";
    order.status = "paid";
    order.payment.cfPaymentId = String(paymentId || "");
    order.payment.paidAt = new Date();
    order.statusHistory.push({
      status: "paid",
      note: "Cashfree payment verified by webhook",
    });
    await order.save();
  } else if (
    ["FAILED", "USER_DROPPED"].includes(paymentStatus) &&
    order.paymentStatus === "pending"
  ) {
    order.paymentStatus = "failed";
    order.status = "cancelled";
    order.addressChangeAllowed = false;
    order.statusHistory.push({
      status: "cancelled",
      note: "Cashfree payment failed; reserved stock released",
    });
    for (const item of order.items)
      await Product.updateOne(
        { _id: item.product },
        { $inc: { stock: item.quantity } },
      );
    await order.save();
  }
  res.json({ success: true });
});
export const verifyCashfreePayment = asyncHandler(async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.orderId,
    user: req.user._id,
  });
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (order.paymentMethod !== "cashfree")
    return res.json({ success: true, order });
  if (!process.env.CASHFREE_CLIENT_ID || !process.env.CASHFREE_CLIENT_SECRET)
    throw new AppError(
      "Cashfree is not configured",
      503,
      "PAYMENTS_NOT_CONFIGURED",
    );
  const response = await fetch(
    `${cashfreeBase()}/orders/${encodeURIComponent(order.payment.providerOrderId)}/payments`,
    {
      headers: {
        "x-api-version": "2023-08-01",
        "x-client-id": process.env.CASHFREE_CLIENT_ID,
        "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
      },
    },
  );
  const cf = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new AppError(
      "Could not verify payment with Cashfree",
      502,
      "CASHFREE_ERROR",
    );
  const payments = Array.isArray(cf) ? cf : cf.data || [];
  const paid = payments.find((p) => p.payment_status === "SUCCESS");
  if (paid && order.paymentStatus !== "paid") {
    order.paymentStatus = "paid";
    order.status = "paid";
    order.payment.cfPaymentId = String(paid.cf_payment_id || "");
    order.payment.paidAt = new Date();
    order.statusHistory.push({
      status: "paid",
      note: "Cashfree payment verified with provider",
    });
    await order.save();
  }
  res.json({ success: true, order });
});
