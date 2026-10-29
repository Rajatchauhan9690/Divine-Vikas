import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import multer from "multer";
import AppError from "../utils/AppError.js";

const uploadDirectory = fileURLToPath(new URL("../../uploads/", import.meta.url));
const extensions = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);

mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDirectory,
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${extensions.get(file.mimetype)}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!extensions.has(file.mimetype))
      return callback(
        new AppError(
          "Product images must be JPEG, PNG, WebP, or GIF",
          400,
          "INVALID_IMAGE_TYPE",
        ),
      );
    callback(null, true);
  },
});

export function uploadProductImage(req, res, next) {
  upload.single("image")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      return next(
        new AppError(
          tooLarge
            ? "Product image must be 5 MB or smaller"
            : "Only one product image can be uploaded",
          tooLarge ? 413 : 400,
          error.code,
        ),
      );
    }
    next(error);
  });
}
