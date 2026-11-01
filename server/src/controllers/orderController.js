import crypto from "node:crypto";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import ProductPaymentAttempt from "../models/ProductPaymentAttempt.js";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cashfreeRequest } from "../services/cashfreeService.js";
import {
  createOrderForPaidAttempt,
  processProductPaymentFailure,
  releaseExpiredProductPaymentAttempts,
  releaseProductPaymentAttempt,
} from "../services/productPaymentService.js";
import { processClassPaymentWebhook } from "./classSessionController.js";
function validAddress(a) {
  return (
    a &&
    ["fullName", "phone", "line1", "city", "state", "postalCode"].every(
      (k) => typeof a[k] === "string" && a[k].trim(),
    ) &&
    /^\+?[0-9 ()-]{8,20}$/.test(a.phone)
  );
}
export const createOrder = asyncHandler(async (req, res) => {
  await releaseExpiredProductPaymentAttempts();
  const raw = req.body.items;
  const address = req.body.shippingAddress;
  if (req.body.paymentMethod !== "cashfree")
    throw new AppError(
      "Only Cashfree online payment is currently available for product orders",
      400,
      "UNSUPPORTED_PAYMENT_METHOD",
    );
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
    const returnable =
      p.returnable !== false &&
      Number.isInteger(p.returnWindowDays) &&
      p.returnWindowDays >= 1 &&
      p.returnWindowDays <= 90;
    items.push({
      product: p._id,
      name: p.name,
      price: p.price,
      quantity,
      returnable,
      returnWindowDays: returnable ? p.returnWindowDays : null,
    });
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
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
  let attempt;
  try {
    const user = await User.findById(req.user._id);
    attempt = await ProductPaymentAttempt.create({
      user: req.user._id,
      items,
      total,
      shippingAddress: address,
      providerOrderId: `DV${crypto.randomBytes(16).toString("hex")}`,
      expiresAt,
    });
    const returnUrl = `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/orders?payment=return&order_id=${attempt._id}`;
    const cf = await cashfreeRequest("/orders", {
      body: {
        order_id: attempt.providerOrderId,
        order_amount: Number(total.toFixed(2)),
        order_currency: "INR",
        order_expiry_time: expiresAt.toISOString(),
        customer_details: {
          customer_id: user._id.toString(),
          customer_name: address.fullName,
          customer_email: user.email,
          customer_phone: address.phone.replace(/[^0-9]/g, "").slice(-10),
        },
        order_meta: {
          return_url: returnUrl,
          notify_url: process.env.CASHFREE_WEBHOOK_URL || undefined,
        },
      },
    });
    attempt.paymentSessionId = cf.payment_session_id;
    await attempt.save();
    return res.status(201).json({
      success: true,
      attemptId: attempt._id,
      payment: {
        provider: "cashfree",
        paymentSessionId: cf.payment_session_id,
        environment:
          process.env.CASHFREE_ENV === "production"
            ? "production"
            : "sandbox",
        expiresAt,
        returnUrl,
      },
    });
  } catch (error) {
    if (attempt) await ProductPaymentAttempt.deleteOne({ _id: attempt._id });
    for (const item of reserved)
      await Product.updateOne(
        { _id: item.product },
        { $inc: { stock: item.quantity } },
      );
    throw error;
  }
});
export const myOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({
    user: req.user._id,
    $or: [
      { paymentMethod: { $ne: "cashfree" } },
      { paymentStatus: { $in: ["paid", "refunded"] } },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.json({ success: true, orders });
});
const cancellableOrderStatuses = ["pending", "paid", "processing"];
const customerOrderCancellationMs = 6 * 60 * 60 * 1000;

async function initiateCashfreeRefund(order, reason, note) {
  if (
    order.paymentMethod !== "cashfree" ||
    order.paymentStatus !== "paid" ||
    !order.payment?.providerOrderId
  )
    throw new AppError(
      "A verified Cashfree payment is required for an automatic refund",
      409,
      "CASHFREE_REFUND_UNAVAILABLE",
    );
  if (["pending", "success"].includes(order.refund?.status))
    return order.refund.status;

  const refundId = order.refund?.refundId || `DV${order._id}REF`;
  const idempotencyKey =
    order.refund?.idempotencyKey || crypto.randomUUID();
  const claimed = await Order.findOneAndUpdate(
    {
      _id: order._id,
      status: order.status,
      paymentStatus: "paid",
      $or: [
        { "refund.status": { $in: ["not_requested", "failed"] } },
        { "refund.status": { $exists: false } },
        {
          "refund.status": "processing",
          "refund.updatedAt": { $lte: new Date(Date.now() - 5 * 60 * 1000) },
        },
      ],
    },
    {
      $set: {
        "refund.status": "processing",
        "refund.reason": reason,
        "refund.refundId": refundId,
        "refund.idempotencyKey": idempotencyKey,
        "refund.note": note,
        "refund.updatedAt": new Date(),
      },
    },
    { new: true },
  );
  if (!claimed) {
    const latest = await Order.findById(order._id);
    if (["pending", "success"].includes(latest?.refund?.status))
      return latest.refund.status;
    throw new AppError(
      "A refund is already being processed. Refresh the order before retrying.",
      409,
      "REFUND_IN_PROGRESS",
    );
  }

  try {
    const response = await cashfreeRequest(
      `/orders/${encodeURIComponent(order.payment.providerOrderId)}/refunds`,
      {
        body: {
          refund_amount: Number(order.total.toFixed(2)),
          refund_id: refundId,
          refund_note: note.slice(0, 100),
        },
        headers: { "x-idempotency-key": idempotencyKey },
      },
    );
    const providerStatus = String(response.refund_status || "").toUpperCase();
    if (
      !["SUCCESS", "PENDING", "PENDING_APPROVAL"].includes(providerStatus)
    )
      throw new AppError(
        response.status_description || "Cashfree did not accept the refund",
        502,
        "CASHFREE_REFUND_REJECTED",
      );
    const status = providerStatus === "SUCCESS" ? "success" : "pending";
    await Order.updateOne(
      { _id: order._id, "refund.status": "processing" },
      {
        $set: {
          "refund.status": status,
          "refund.providerRefundId": String(response.cf_refund_id || ""),
          "refund.updatedAt": new Date(),
          ...(status === "success" ? { paymentStatus: "refunded" } : {}),
        },
      },
    );
    return status;
  } catch (error) {
    await Order.updateOne(
      { _id: order._id, "refund.status": "processing" },
      {
        $set: {
          "refund.status": "failed",
          "refund.updatedAt": new Date(),
        },
      },
    );
    throw error;
  }
}

async function cancelOrder(orderId, actor, isAdmin) {
  const query = { _id: orderId };
  if (!isAdmin) query.user = actor._id;
  const existing = await Order.findOne(query);
  if (!existing)
    throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (!cancellableOrderStatuses.includes(existing.status))
    throw new AppError(
      "This order can no longer be cancelled",
      409,
      "ORDER_CANCELLATION_CLOSED",
    );
  if (
    !isAdmin &&
    Date.now() - existing.createdAt.getTime() >= customerOrderCancellationMs
  )
    throw new AppError(
      "Orders can only be cancelled within 6 hours of being placed",
      409,
      "ORDER_CANCELLATION_WINDOW_CLOSED",
    );
  const claimFilter = {
    _id: existing._id,
    status: { $in: cancellableOrderStatuses },
    $or: [
      { cancellationProcessing: { $ne: true } },
      {
        cancellationProcessingAt: {
          $lte: new Date(Date.now() - 5 * 60 * 1000),
        },
      },
      { cancellationProcessingAt: null },
    ],
  };
  if (!isAdmin) {
    claimFilter.user = actor._id;
    claimFilter.createdAt = {
      $gt: new Date(Date.now() - customerOrderCancellationMs),
    };
  }
  const claimed = await Order.findOneAndUpdate(
    claimFilter,
    {
      $set: {
        cancellationProcessing: true,
        cancellationProcessingAt: new Date(),
      },
    },
    { new: true },
  );
  if (!claimed)
    throw new AppError(
      "Order status changed before cancellation could be completed. Refresh and try again.",
      409,
      "ORDER_CANCELLATION_CONFLICT",
    );
  const paidOnlineOrder =
    claimed.paymentMethod === "cashfree" &&
    claimed.paymentStatus === "paid";
  let refundStatus = claimed.refund?.status || "not_requested";
  try {
    if (isAdmin && paidOnlineOrder) {
      refundStatus = await initiateCashfreeRefund(
        claimed,
        "admin_cancellation",
        `Admin cancellation refund for order ${String(claimed._id).slice(-8)}`,
      );
    }
  } catch (error) {
    await Order.updateOne(
      { _id: claimed._id, cancellationProcessing: true },
      {
        $set: { cancellationProcessing: false, cancellationProcessingAt: null },
      },
    );
    throw error;
  }
  const note =
    paidOnlineOrder && isAdmin
      ? `Cancelled by Admin. Cashfree refund ${refundStatus}.`
      : paidOnlineOrder
        ? "Cancelled by customer. Cashfree refund must be handled manually."
      : `Cancelled by ${isAdmin ? "Admin" : "customer"}.`;
  const cancellation = {
    _id: orderId,
    status: { $in: cancellableOrderStatuses },
    cancellationProcessing: true,
  };
  if (!isAdmin) {
    cancellation.user = actor._id;
    cancellation.createdAt = {
      $gt: new Date(Date.now() - customerOrderCancellationMs),
    };
  }
  const now = new Date();
  const order = await Order.findOneAndUpdate(
    cancellation,
    {
      $set: {
        status: "cancelled",
        cancellationProcessing: false,
        cancellationProcessingAt: null,
        inventoryReleasedAt: now,
      },
      $push: {
        statusHistory: {
          status: "cancelled",
          note,
          at: now,
          by: actor._id,
        },
      },
    },
    { new: true, runValidators: true },
  );
  if (!order)
  {
    await Order.updateOne(
      { _id: orderId, cancellationProcessing: true },
      {
        $set: { cancellationProcessing: false, cancellationProcessingAt: null },
      },
    );
    throw new AppError(
      "Order status changed before cancellation could be completed. Refresh and try again.",
      409,
      "ORDER_CANCELLATION_CONFLICT",
    );
  }

  for (const item of order.items) {
    const restored = await Product.updateOne(
      { _id: item.product },
      { $inc: { stock: item.quantity } },
    );
    if (!restored.modifiedCount)
      throw new AppError(
        `Could not restore inventory for ${item.name} after cancellation`,
        500,
        "ORDER_INVENTORY_RESTORE_FAILED",
      );
  }
  return order;
}

export const requestOrderReturn = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || "").trim();
  if (!reason || reason.length > 500)
    throw new AppError(
      "Enter a return reason of up to 500 characters",
      400,
      "INVALID_RETURN_REASON",
    );
  const order = await Order.findOne({
    _id: req.params.orderId,
    user: req.user._id,
  });
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (
    order.status !== "delivered" ||
    !order.deliveredAt ||
    (order.returnRequest?.status || "none") !== "none"
  )
    throw new AppError(
      "This order is not eligible for a return request",
      409,
      "RETURN_NOT_AVAILABLE",
    );
  if (
    order.items.some(
      (item) =>
        item.returnable === false ||
        !Number.isInteger(item.returnWindowDays) ||
        item.returnWindowDays < 1,
    )
  )
    throw new AppError(
      "This order contains a non-returnable product or an item without a return policy",
      409,
      "NON_RETURNABLE_ITEM",
    );
  if (order.paymentMethod !== "cashfree" || order.paymentStatus !== "paid")
    throw new AppError(
      "Automatic return refunds are available only for verified Cashfree orders",
      409,
      "RETURN_REFUND_UNAVAILABLE",
    );
  const isWithinReturnWindow = order.items.every((item) => {
    return (
      Date.now() <=
      order.deliveredAt.getTime() +
      item.returnWindowDays * 24 * 60 * 60 * 1000
    );
  });
  if (!isWithinReturnWindow)
    throw new AppError(
      "The return window has ended for one or more items in this order",
      409,
      "RETURN_WINDOW_CLOSED",
    );
  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      user: req.user._id,
      status: "delivered",
      paymentMethod: "cashfree",
      paymentStatus: "paid",
      $or: [
        { "returnRequest.status": "none" },
        { "returnRequest.status": { $exists: false } },
      ],
    },
    {
      $set: {
        "returnRequest.status": "requested",
        "returnRequest.reason": reason,
        "returnRequest.requestedAt": new Date(),
      },
    },
    { new: true, runValidators: true },
  );
  if (!updatedOrder)
    throw new AppError(
      "A return request already exists or this order is no longer eligible",
      409,
      "RETURN_NOT_AVAILABLE",
    );
  res.status(201).json({ success: true, order: updatedOrder });
});

export const adminUpdateOrderReturn = asyncHandler(async (req, res) => {
  const nextStatus = String(req.body.status || "");
  if (!["approved", "rejected", "received"].includes(nextStatus))
    throw new AppError("Invalid return action", 400, "INVALID_RETURN_ACTION");
  const order = await Order.findById(req.params.orderId);
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  const currentStatus = order.returnRequest?.status || "none";
  if (
    (nextStatus === "approved" || nextStatus === "rejected") &&
    currentStatus !== "requested"
  )
    throw new AppError(
      "Only a pending return request can be reviewed",
      409,
      "RETURN_REVIEW_CLOSED",
    );
  if (
    nextStatus === "received" &&
    !["approved", "refund_failed"].includes(currentStatus)
  )
    throw new AppError(
      "Approve the return before marking it received",
      409,
      "RETURN_NOT_APPROVED",
    );

  if (nextStatus === "approved" || nextStatus === "rejected") {
    order.returnRequest.status = nextStatus;
    order.returnRequest.reviewedAt = new Date();
    order.returnRequest.reviewedBy = req.user._id;
    await order.save();
    return res.json({ success: true, order });
  }

  order.returnRequest.status = "refund_pending";
  order.returnRequest.receivedAt =
    order.returnRequest.receivedAt || new Date();
  await order.save();
  try {
    const refundStatus = await initiateCashfreeRefund(
      order,
      "customer_return",
      `Return refund for order ${String(order._id).slice(-8)}`,
    );
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "returnRequest.status":
            refundStatus === "success" ? "refunded" : "refund_pending",
          ...(refundStatus === "success" ? { paymentStatus: "refunded" } : {}),
        },
      },
    );
  } catch (error) {
    const latest = await Order.findById(order._id).select("refund.status");
    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          "returnRequest.status":
            latest?.refund?.status === "failed"
              ? "refund_failed"
              : "refund_pending",
        },
      },
    );
    throw error;
  }
  res.json({ success: true, order: await Order.findById(order._id) });
});

export const cancelMyOrder = asyncHandler(async (req, res) => {
  const order = await cancelOrder(req.params.orderId, req.user, false);
  res.json({ success: true, order });
});

export const adminCancelOrder = asyncHandler(async (req, res) => {
  const order = await cancelOrder(req.params.orderId, req.user, true);
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
  if (req.body.status === "cancelled")
    throw new AppError(
      "Use the dedicated cancellation action to cancel an order",
      400,
      "USE_ORDER_CANCELLATION",
    );
  if (order.status === "cancelled")
    throw new AppError(
      "Cancelled orders cannot be modified",
      409,
      "ORDER_ALREADY_CANCELLED",
    );
  if (order.cancellationProcessing)
    throw new AppError(
      "Order cancellation is in progress",
      409,
      "ORDER_CANCELLATION_IN_PROGRESS",
    );
  if (order.cancellationProcessing)
    throw new AppError(
      "Order cancellation is in progress",
      409,
      "ORDER_CANCELLATION_IN_PROGRESS",
    );
  const allowed = [
    "pending",
    "paid",
    "processing",
    "shipped",
    "delivered",
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
    if (req.body.status === "delivered" && !order.deliveredAt)
      order.deliveredAt = new Date();
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
  await order.save();
  res.json({ success: true, order });
});

export const shiprocketWebhook = asyncHandler(async (req, res) => {
  const expectedToken = process.env.SHIPROCKET_WEBHOOK_TOKEN;
  const suppliedToken = req.headers["x-api-key"];
  if (!expectedToken || !suppliedToken)
    throw new AppError("Courier webhook is not configured", 503, "WEBHOOK_NOT_CONFIGURED");
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(String(suppliedToken));
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied))
    throw new AppError("Invalid courier webhook token", 401, "INVALID_WEBHOOK");
  const awb = String(req.body.awb || "").trim();
  const rawStatus = String(req.body.current_status || req.body.shipment_status || "").trim();
  if (!awb || !rawStatus)
    return res.status(400).json({ success: false, message: "AWB and shipment status are required" });
  const order = await Order.findOne({ "tracking.trackingNumber": awb });
  if (!order) return res.json({ success: true, ignored: true });
  const normalized = rawStatus.toLowerCase();
  const nextStatus =
    /out for delivery/.test(normalized)
      ? "shipped"
      : /\bdelivered\b/.test(normalized)
        ? "delivered"
        : /cancel|rto|return to origin/.test(normalized)
          ? ""
          : /transit|pickup|manifest|shipped/.test(normalized)
            ? "shipped"
            : "";
  const note = `Shiprocket tracking update: ${rawStatus}`.slice(0, 300);
  if (
    nextStatus &&
    order.status !== "cancelled" &&
    !(order.status === "delivered" && nextStatus !== "delivered")
  ) {
    order.status = nextStatus;
    if (nextStatus === "delivered" && !order.deliveredAt)
      order.deliveredAt = new Date();
    order.statusHistory.push({ status: nextStatus, note });
  } else {
    order.statusHistory.push({ status: order.status, note });
  }
  if (req.body.courier_name)
    order.tracking.courier = String(req.body.courier_name).slice(0, 100);
  if (typeof req.body.tracking_url === "string" && /^https:\/\//i.test(req.body.tracking_url))
    order.tracking.trackingUrl = req.body.tracking_url.slice(0, 500);
  await order.save();
  res.json({ success: true });
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
  const refundEvent = event.data?.refund;
  if (refundEvent && /REFUND/.test(String(event.type || "").toUpperCase())) {
    const refundOrderId =
      event.data?.order?.order_id || refundEvent.order_id;
    const refundStatus = String(refundEvent.refund_status || "").toUpperCase();
    const refundOrder = await Order.findOne({
      "payment.providerOrderId": refundOrderId,
      $or: [
        { "refund.refundId": refundEvent.refund_id },
        { "refund.providerRefundId": refundEvent.cf_refund_id },
      ],
    });
    if (
      refundOrder &&
      ["SUCCESS", "FAILED", "REJECTED", "CANCELLED"].includes(refundStatus)
    ) {
      const succeeded = refundStatus === "SUCCESS";
      refundOrder.refund.status = succeeded ? "success" : "failed";
      refundOrder.refund.providerRefundId = String(
        refundEvent.cf_refund_id || refundOrder.refund.providerRefundId || "",
      );
      refundOrder.refund.updatedAt = new Date();
      if (succeeded) refundOrder.paymentStatus = "refunded";
      if (
        ["refund_pending", "refund_failed"].includes(
          refundOrder.returnRequest?.status,
        )
      )
        refundOrder.returnRequest.status = succeeded
          ? "refunded"
          : "refund_failed";
      await refundOrder.save();
    }
    return res.json({ success: true });
  }
  const cfOrderId = event.data?.order?.order_id;
  const paymentStatus = event.data?.payment?.payment_status;
  const paymentId = event.data?.payment?.cf_payment_id;
  if (!cfOrderId || !paymentStatus)
    return res.json({ success: true, ignored: true });
  let order = await Order.findOne({ "payment.providerOrderId": cfOrderId });
  if (!order) {
    const attempt = await ProductPaymentAttempt.findOne({
      providerOrderId: cfOrderId,
    });
    if (attempt) {
      if (paymentStatus === "SUCCESS") {
        const amount = Number(event.data?.payment?.payment_amount);
        if (
          Number.isFinite(amount) &&
          amount !== Number(attempt.total.toFixed(2))
        ) {
          await releaseProductPaymentAttempt(attempt, "refund_required");
          await ProductPaymentAttempt.updateOne(
            { _id: attempt._id, status: { $ne: "order_created" } },
            {
              $set: {
                status: "refund_required",
                paymentStatus: "paid",
                cfPaymentId: String(paymentId || ""),
              },
            },
          );
          return res.json({ success: true, refundRequired: true });
        }
        const createdOrder = await createOrderForPaidAttempt(attempt, paymentId);
        const latestAttempt = await ProductPaymentAttempt.findById(attempt._id);
        if (
          !createdOrder &&
          ["processing", "releasing"].includes(latestAttempt?.status)
        )
          throw new AppError(
            "Payment confirmation is being processed; retry shortly",
            503,
            "PAYMENT_CONFIRMATION_IN_PROGRESS",
          );
        return res.json({
          success: true,
          refundRequired: latestAttempt?.status === "refund_required",
        });
      }
      if (["FAILED", "USER_DROPPED", "CANCELLED", "VOID"].includes(paymentStatus))
        await processProductPaymentFailure(attempt);
      return res.json({ success: true });
    }
  }
  if (!order) {
    const handled = await processClassPaymentWebhook({
      paymentOrderId: cfOrderId,
      paymentStatus,
      paymentId: String(paymentId || ""),
      paymentAmount: event.data?.payment?.payment_amount,
    });
    return res.json({ success: true, ignored: !handled });
  }
  if (paymentStatus === "SUCCESS" && order.paymentStatus !== "paid") {
    await recordCashfreeOrderPayment(order, paymentId);
  } else if (
    ["FAILED", "USER_DROPPED"].includes(paymentStatus) &&
    order.paymentStatus === "pending"
  ) {
    const now = new Date();
    const failedOrder = await Order.findOneAndUpdate(
      {
        _id: order._id,
        paymentStatus: "pending",
        inventoryReleasedAt: null,
      },
      {
        $set: {
          paymentStatus: "failed",
          status: "cancelled",
          inventoryReleasedAt: now,
        },
        $push: {
          statusHistory: {
            status: "cancelled",
            note: "Cashfree payment failed; reserved stock released",
            at: now,
          },
        },
      },
      { new: true },
    );
    if (failedOrder) {
      for (const item of failedOrder.items) {
        const restored = await Product.updateOne(
          { _id: item.product },
          { $inc: { stock: item.quantity } },
        );
        if (!restored.modifiedCount)
          throw new AppError(
            `Could not restore inventory for ${item.name} after payment failure`,
            500,
            "ORDER_INVENTORY_RESTORE_FAILED",
          );
      }
    } else {
      await Order.findOneAndUpdate(
        { _id: order._id, paymentStatus: "pending" },
        {
          $set: { paymentStatus: "failed", status: "cancelled" },
          $push: {
            statusHistory: {
              status: "cancelled",
              note: "Cashfree payment failed after inventory was already released",
              at: now,
            },
          },
        },
      );
    }
  }
  res.json({ success: true });
});
export const verifyCashfreePayment = asyncHandler(async (req, res) => {
  await releaseExpiredProductPaymentAttempts();
  const order = await Order.findOne({
    _id: req.params.orderId,
    user: req.user._id,
  });
  if (!order) {
    const attempt = await ProductPaymentAttempt.findOne({
      _id: req.params.orderId,
      user: req.user._id,
    });
    if (!attempt)
      throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    if (attempt.status === "order_created" && attempt.order) {
      const createdOrder = await Order.findById(attempt.order);
      return res.json({
        success: true,
        paymentStatus: "paid",
        order: createdOrder,
      });
    }
    if (attempt.status === "refund_required")
      return res.json({
        success: true,
        paymentStatus: "refund_required",
        order: null,
      });
    const cf = await cashfreeRequest(
      `/orders/${encodeURIComponent(attempt.providerOrderId)}/payments`,
      { method: "GET" },
    );
    const payments = Array.isArray(cf) ? cf : cf.data || [];
    const paid = payments.find((payment) => payment.payment_status === "SUCCESS");
    if (paid) {
      const amount = Number(paid.payment_amount);
      if (
        Number.isFinite(amount) &&
        amount !== Number(attempt.total.toFixed(2))
      ) {
        await releaseProductPaymentAttempt(attempt, "refund_required");
        await ProductPaymentAttempt.updateOne(
          { _id: attempt._id, status: { $ne: "order_created" } },
          {
            $set: {
              status: "refund_required",
              paymentStatus: "paid",
              cfPaymentId: String(paid.cf_payment_id || ""),
            },
          },
        );
        return res.json({
          success: true,
          paymentStatus: "refund_required",
          order: null,
        });
      }
      const createdOrder = await createOrderForPaidAttempt(
        attempt,
        paid.cf_payment_id,
      );
      const latestAttempt = await ProductPaymentAttempt.findById(attempt._id);
      if (createdOrder)
        return res.json({
          success: true,
          paymentStatus: "paid",
          order: createdOrder,
        });
      if (latestAttempt?.status === "refund_required")
        return res.json({
          success: true,
          paymentStatus: "refund_required",
          order: null,
        });
      throw new AppError(
        "Payment confirmation is being processed. Please refresh shortly.",
        503,
        "PAYMENT_CONFIRMATION_IN_PROGRESS",
      );
    }
    if (
      payments.length &&
      payments.every((payment) =>
        ["FAILED", "USER_DROPPED", "CANCELLED", "VOID"].includes(
          payment.payment_status,
        ),
      )
    ) {
      await processProductPaymentFailure(attempt);
      return res.json({
        success: true,
        paymentStatus: "failed",
        order: null,
      });
    }
    const latestAttempt = await ProductPaymentAttempt.findById(attempt._id);
    return res.json({
      success: true,
      paymentStatus:
        latestAttempt?.status === "expired" ? "expired" : "pending",
      order: null,
    });
  }
  if (order.paymentMethod !== "cashfree")
    return res.json({ success: true, order });
  if (!process.env.CASHFREE_CLIENT_ID || !process.env.CASHFREE_CLIENT_SECRET)
    throw new AppError(
      "Cashfree is not configured",
      503,
      "PAYMENTS_NOT_CONFIGURED",
    );
  const cf = await cashfreeRequest(
    `/orders/${encodeURIComponent(order.payment.providerOrderId)}/payments`,
    { method: "GET" },
  );
  const payments = Array.isArray(cf) ? cf : cf.data || [];
  const paid = payments.find((p) => p.payment_status === "SUCCESS");
  if (paid && order.paymentStatus !== "paid") {
    await recordCashfreeOrderPayment(order, paid.cf_payment_id);
  }
  const latestOrder = await Order.findById(order._id);
  res.json({ success: true, order: latestOrder });
});

async function recordCashfreeOrderPayment(order, paymentId) {
  const fields = {
    paymentStatus: "paid",
    "payment.cfPaymentId": String(paymentId || ""),
    "payment.paidAt": new Date(),
  };
  const now = new Date();
  const cancellationNote =
    "Cashfree payment succeeded after order cancellation; Admin must handle any refund manually.";
  const cancelledOrder = await Order.findOneAndUpdate(
    { _id: order._id, status: "cancelled", paymentStatus: { $ne: "paid" } },
    {
      $set: fields,
      $push: {
        statusHistory: {
          status: "cancelled",
          note: cancellationNote,
          at: now,
        },
      },
    },
    { new: true },
  );
  if (cancelledOrder) return cancelledOrder;

  const paidOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      status: { $ne: "cancelled" },
      paymentStatus: { $ne: "paid" },
    },
    {
      $set: { ...fields, status: "paid" },
      $push: {
        statusHistory: {
          status: "paid",
          note: "Cashfree payment verified with provider",
          at: now,
        },
      },
    },
    { new: true },
  );
  return paidOrder || Order.findById(order._id);
}
