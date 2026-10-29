import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import AppError from "../utils/AppError.js";

function configureCloudinary() {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  if (!cloudName || !apiKey || !apiSecret)
    throw new AppError(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
      503,
      "CLOUDINARY_NOT_CONFIGURED",
    );
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

export async function uploadProductImage(buffer) {
  configureCloudinary();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "divine-vikas/products",
        public_id: randomUUID(),
        resource_type: "image",
        overwrite: false,
      },
      (error, result) => {
        if (error || !result?.secure_url || !result.public_id)
          return reject(
            new AppError(
              "Could not upload the product image to Cloudinary",
              502,
              "IMAGE_UPLOAD_FAILED",
            ),
          );
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.on("error", () =>
      reject(
        new AppError(
          "Could not upload the product image to Cloudinary",
          502,
          "IMAGE_UPLOAD_FAILED",
        ),
      ),
    );
    stream.end(buffer);
  });
}

export async function deleteCloudinaryImage(publicId) {
  configureCloudinary();
  const result = await cloudinary.uploader.destroy(publicId, {
    invalidate: true,
    resource_type: "image",
  });
  if (result.result !== "ok" && result.result !== "not found")
    throw new AppError(
      "Could not clean up the Cloudinary image",
      502,
      "IMAGE_CLEANUP_FAILED",
    );
}
