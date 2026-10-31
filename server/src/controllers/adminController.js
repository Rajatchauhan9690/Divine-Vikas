import Product from "../models/Product.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import mongoose from "mongoose";
import {
  assignShiprocketCourier,
  createShiprocketOrder,
  generateShiprocketLabel,
  getShiprocketCouriers,
} from "../services/shiprocketService.js";
import { sendOrderWhatsApp } from "../services/whatsappService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const dashboard = asyncHandler(async (req, res) => {
  const [products, orders, users, revenue] = await Promise.all([
    Product.countDocuments({ active: true }),
    Order.countDocuments(),
    User.countDocuments({ role: "customer" }),
    Order.aggregate([
      { $match: { status: { $ne: "cancelled" } } },
      { $group: { _id: null, total: { $sum: "$total" } } },
    ]),
  ]);
  res.json({
    success: true,
    users,
    revenue: revenue[0]?.total || 0,
    metrics: { products, orders, users },
  });
});

function pagination(query) {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50)
    : 20;
  const page = Number.isFinite(requestedPage)
    ? Math.max(requestedPage, 1)
    : 1;
  return { page, limit, skip: (page - 1) * limit };
}

export const listAdminProducts = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const filter = { active: true };
  const search = String(req.query.search || "").trim().slice(0, 100);
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = ["name", "shortDescription", "description"].map((field) => ({
      [field]: { $regex: escapedSearch, $options: "i" },
    }));
  }
  const [products, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  res.json({
    success: true,
    products,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const listAdminOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = pagination(req.query);
  const search = String(req.query.search || "").trim().slice(0, 100);
  const filter = {};
  const searchFilter = {};
  const status = String(req.query.status || "");
  const orderStatuses = [
    "pending",
    "paid",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ];
  if (status) {
    if (!orderStatuses.includes(status))
      throw new AppError("Invalid order status filter", 400, "INVALID_ORDER_STATUS");
    filter.status = status;
  }
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matchingUsers = await User.find({
      name: { $regex: escapedSearch, $options: "i" },
    })
      .select("_id")
      .lean();
    const conditions = [{ user: { $in: matchingUsers.map((user) => user._id) } }];
    if (/^\d+(?:\.\d*)?$/.test(search))
      conditions.push({
        $expr: {
          $regexMatch: {
            input: { $toString: "$total" },
            regex: escapedSearch,
          },
        },
      });
    if (search.length >= 3 && /^[a-f\d]+$/i.test(search))
      conditions.push({
        $expr: {
          $regexMatch: {
            input: { $toString: "$_id" },
            regex: escapedSearch,
            options: "i",
          },
        },
      });
    searchFilter.$or = conditions;
  }
  Object.assign(filter, searchFilter);
  const [orders, total, totalOrders] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("user", "name email")
      .populate("statusHistory.by", "name role")
      .populate("returnRequest.reviewedBy", "name role")
      .lean(),
    Order.countDocuments(filter),
    Order.countDocuments(searchFilter),
  ]);
  res.json({
    success: true,
    orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    totalOrders,
  });
});

function packageDetails(input) {
  const details = {
    weight: Number(input.weight),
    length: Number(input.length),
    breadth: Number(input.breadth),
    height: Number(input.height),
  };
  if (
    Object.values(details).some((value) => !Number.isFinite(value) || value <= 0)
  )
    throw new AppError(
      "Enter positive package weight, length, breadth, and height",
      400,
      "INVALID_PACKAGE_DETAILS",
    );
  return details;
}

export const listOrderCouriers = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.orderId))
    throw new AppError("Invalid order ID", 400, "INVALID_ORDER_ID");
  const order = await Order.findById(req.params.orderId).select(
    "shippingAddress total status paymentStatus cancellationProcessing",
  );
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (
    !["paid", "processing"].includes(order.status) ||
    order.paymentStatus !== "paid" ||
    order.cancellationProcessing
  )
    throw new AppError(
      "Only paid orders can be shipped",
      409,
      "ORDER_NOT_READY_TO_SHIP",
    );
  const packageData = packageDetails(req.query);
  const couriers = await getShiprocketCouriers({
    deliveryPostalCode: order.shippingAddress.postalCode,
    weight: packageData.weight,
    declaredValue: order.total,
  });
  res.json({
    success: true,
    couriers: couriers.map((courier) => ({
      id: courier.courier_company_id,
      name: courier.courier_name,
      rate: courier.rate,
      estimatedDays: courier.estimated_delivery_days,
    })),
  });
});

export const createOrderShipment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.orderId))
    throw new AppError("Invalid order ID", 400, "INVALID_ORDER_ID");
  const order = await Order.findById(req.params.orderId).populate("user", "email");
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (
    !["paid", "processing"].includes(order.status) ||
    order.paymentStatus !== "paid" ||
    order.cancellationProcessing
  )
    throw new AppError(
      "Only paid orders can be shipped",
      409,
      "ORDER_NOT_READY_TO_SHIP",
    );
  const packageData = packageDetails(req.body);
  const courierId = Number(req.body.courierId);
  if (!Number.isInteger(courierId) || courierId < 1)
    throw new AppError("Choose an available courier", 400, "INVALID_COURIER");

  order.shipping ||= {};
  order.tracking ||= {};
  if (!order.shipping.shiprocketOrderId) {
    const created = await createShiprocketOrder(order, packageData);
    const shipmentId = created.shipment_id || created.shipments?.[0]?.id;
    if (!created.order_id || !shipmentId)
      throw new AppError(
        "Shiprocket created no shipment details",
        502,
        "SHIPROCKET_INVALID_RESPONSE",
      );
    order.shipping.shiprocketOrderId = String(created.order_id);
    order.shipping.shipmentId = String(shipmentId);
    order.shipping.package = packageData;
    await order.save();
  }
  order.shipping.package = packageData;

  if (!order.tracking?.trackingNumber) {
    const awb = await assignShiprocketCourier(
      order.shipping.shipmentId,
      courierId,
    );
    const assigned = awb.response?.data || awb;
    if (!assigned.awb_code)
      throw new AppError(
        assigned.message || "Shiprocket did not assign an AWB",
        502,
        "SHIPROCKET_AWB_FAILED",
      );
    order.tracking.courier =
      assigned.courier_name || assigned.courier_company_name || "Shiprocket";
    order.tracking.trackingNumber = String(assigned.awb_code);
    await order.save();
  }
  if (!order.shipping.labelUrl) {
    const label = await generateShiprocketLabel(order.shipping.shipmentId);
    const labelUrl = label.label_url || label.response?.label_url;
    if (!labelUrl)
      throw new AppError(
        label.message || "Shiprocket did not return a shipping label",
        502,
        "SHIPROCKET_LABEL_FAILED",
      );
    order.shipping.labelUrl = String(labelUrl);
  }
  order.status = "shipped";
  order.addressChangeAllowed = false;
  order.statusHistory.push({
    status: "shipped",
    note: "Shipment created and label generated through Shiprocket",
    by: req.user._id,
  });

  await order.save();
  res.json({ success: true, order });
});

export const retryOrderWhatsApp = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  if (order.paymentStatus !== "paid")
    throw new AppError(
      "Only paid orders can send a confirmation message",
      409,
      "ORDER_NOT_PAID",
    );
  const status = await sendOrderWhatsApp(order._id, { retry: true });
  const latest = await Order.findById(order._id);
  res.json({
    success: status === "sent",
    status: latest.whatsapp.status,
    order: latest,
  });
});
