import Product from "../models/Product.js";
import AppError from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  deleteCloudinaryImage,
  uploadProductImage,
} from "../services/cloudinaryService.js";

function parseReturnWindowDays(value) {
  if (value === undefined || value === null || String(value).trim() === "")
    return null;
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= 90 ? days : undefined;
}

function parseReturnable(value) {
  if (value === undefined) return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

export const listProducts = asyncHandler(async (req, res) => {
  const { search = "", category = "" } = req.query;
  const filter = { active: true };
  if (category) filter.category = category;
  if (search.trim()) {
    const searchRegex = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = ["name", "shortDescription", "description"].map((field) => ({
      [field]: {
        $regex: searchRegex,
        $options: "i",
      },
    }));
  }
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
  if (
    product.returnable === false ||
    !Number.isInteger(product.returnWindowDays) ||
    product.returnWindowDays < 1
  ) {
    product.returnable = false;
    product.returnWindowDays = null;
  }
  res.json({ success: true, product });
});
export const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    price,
    category,
    shortDescription,
    description,
    stock,
    returnable: rawReturnable,
    returnWindowDays: rawReturnWindowDays,
  } = req.body;
  const parsedPrice = Number(price);
  const parsedStock = Number(stock);
  const parsedReturnable = parseReturnable(rawReturnable);
  const returnable = parsedReturnable ?? true;
  const returnWindowDays = parseReturnWindowDays(rawReturnWindowDays);
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
    (rawReturnable !== undefined && parsedReturnable === null) ||
    (returnable &&
      (!Number.isInteger(returnWindowDays) ||
        returnWindowDays < 1 ||
        returnWindowDays > 90)) ||
    (!returnable && returnWindowDays === undefined) ||
    !req.file;
  if (invalid) {
    throw new AppError(
      "Provide a valid name, price, category, stock, image, short description, and description",
      400,
      "INVALID_PRODUCT",
    );
  }
  const uploadedImage = await uploadProductImage(req.file.buffer);
  let product;
  try {
    product = await Product.create({
      name: name.trim(),
      price: parsedPrice,
      category,
      shortDescription: shortDescription.trim(),
      description: description.trim(),
      image: uploadedImage.url,
      stock: parsedStock,
      returnable,
      returnWindowDays: returnable ? returnWindowDays : null,
    });
  } catch (error) {
    try {
      await deleteCloudinaryImage(uploadedImage.publicId);
    } catch (cleanupError) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Failed to clean up an unreferenced Cloudinary image",
          publicId: uploadedImage.publicId,
          error: cleanupError.message,
        }),
      );
    }
    throw error;
  }
  res.status(201).json({ success: true, product });
});
export const updateProduct = asyncHandler(async (req, res) => {
  const {
    name,
    price,
    category,
    shortDescription,
    description,
    stock,
    returnable: rawReturnable,
    returnWindowDays: rawReturnWindowDays,
  } = req.body;
  const parsedPrice = Number(price);
  const parsedStock = Number(stock);
  const returnable = parseReturnable(rawReturnable);
  const returnWindowDays =
    rawReturnWindowDays === undefined
      ? undefined
      : parseReturnWindowDays(rawReturnWindowDays);
  const categories = ["Devoted to god", "Mood uplifters", "Other"];
  if (
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
    (rawReturnable !== undefined && returnable === null) ||
    (rawReturnWindowDays !== undefined && returnWindowDays === undefined)
  ) {
    throw new AppError(
      "Provide a valid name, price, category, stock, short description, and description",
      400,
      "INVALID_PRODUCT",
    );
  }
  const product = await Product.findOne({
    _id: req.params.id,
    active: true,
  });
  if (!product)
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  const nextReturnWindowDays =
    rawReturnWindowDays === undefined
      ? product.returnWindowDays
      : returnWindowDays;
  const nextReturnable =
    returnable ??
    (product.returnable !== false &&
      Number.isInteger(nextReturnWindowDays) &&
      nextReturnWindowDays >= 1 &&
      nextReturnWindowDays <= 90);
  if (
    nextReturnable &&
    (!Number.isInteger(nextReturnWindowDays) ||
      nextReturnWindowDays < 1 ||
      nextReturnWindowDays > 90)
  )
    throw new AppError(
      "A returnable product needs a return window between 1 and 90 days",
      400,
      "INVALID_RETURN_WINDOW",
    );

  const uploadedImage = req.file
    ? await uploadProductImage(req.file.buffer)
    : null;
  try {
    product.name = name.trim();
    product.price = parsedPrice;
    product.category = category;
    product.shortDescription = shortDescription.trim();
    product.description = description.trim();
    product.stock = parsedStock;
    product.returnable = nextReturnable;
    product.returnWindowDays = nextReturnable ? nextReturnWindowDays : null;
    if (uploadedImage) product.image = uploadedImage.url;
    await product.save();
  } catch (error) {
    if (uploadedImage) {
      try {
        await deleteCloudinaryImage(uploadedImage.publicId);
      } catch (cleanupError) {
        console.error(
          JSON.stringify({
            level: "error",
            message: "Failed to clean up an unreferenced Cloudinary image",
            publicId: uploadedImage.publicId,
            error: cleanupError.message,
          }),
        );
      }
    }
    throw error;
  }
  res.json({ success: true, product });
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
