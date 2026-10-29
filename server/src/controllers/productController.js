import Product from "../models/Product.js";
import { unlink } from "node:fs/promises";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
export const listProducts = asyncHandler(async (req, res) => {
  const { search = "", category = "" } = req.query;
  const filter = { active: true };
  if (category) filter.category = category;
  if (search.trim())
    filter.name = {
      $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  const products = await Product.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60");
  res.json({ success: true, products });
});
export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({
    _id: req.params.id,
    active: true,
  }).lean();
  if (!product)
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  res.json({ success: true, product });
});
export const createProduct = asyncHandler(async (req, res) => {
  const { name, price, category, shortDescription, description, stock } =
    req.body;
  const parsedPrice = Number(price);
  const parsedStock = Number(stock);
  const categories = ["Devoted to god", "Mood uplifters", "Other"];
  const invalid =
    typeof name !== "string" ||
    name.trim().length < 2 ||
    name.trim().length > 120 ||
    !Number.isFinite(parsedPrice) ||
    parsedPrice < 1 ||
    !categories.includes(category) ||
    typeof shortDescription !== "string" ||
    !shortDescription.trim() ||
    shortDescription.trim().length > 180 ||
    typeof description !== "string" ||
    !description.trim() ||
    description.trim().length > 3000 ||
    stock === undefined ||
    stock === null ||
    String(stock).trim() === "" ||
    !Number.isInteger(parsedStock) ||
    parsedStock < 0 ||
    !req.file;
  if (invalid) {
    if (req.file) await unlink(req.file.path);
    throw new AppError(
      "Provide a valid name, price, category, stock, image, short description, and description",
      400,
      "INVALID_PRODUCT",
    );
  }
  const product = await Product.create({
    name: name.trim(),
    price: parsedPrice,
    category,
    shortDescription: shortDescription.trim(),
    description: description.trim(),
    image: `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`,
    stock: parsedStock,
  });
  res.status(201).json({ success: true, product });
});
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { active: false },
    { new: true },
  );
  if (!product)
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  res.json({ success: true, message: "Product archived" });
});
