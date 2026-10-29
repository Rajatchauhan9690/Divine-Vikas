import Product from "../models/Product.js";
import Order from "../models/Order.js";
import User from "../models/User.js";
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
  const productList = await Product.find({ active: true })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  const recentOrders = await Order.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .populate("user", "name email")
    .lean();
  res.json({
    success: true,
    products: productList,
    orders: recentOrders,
    users,
    revenue: revenue[0]?.total || 0,
    metrics: { products, orders, users },
  });
});
