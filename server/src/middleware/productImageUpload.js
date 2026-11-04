import multer from "multer";
import AppError from "../utils/AppError.js";

const imageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!imageTypes.has(file.mimetype))
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
