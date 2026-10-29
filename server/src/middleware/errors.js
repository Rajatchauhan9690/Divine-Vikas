import AppError from "../utils/AppError.js";
export function notFound(req, res, next) {
  next(
    new AppError(
      `Route not found: ${req.method} ${req.originalUrl}`,
      404,
      "NOT_FOUND",
    ),
  );
}
export function errorHandler(err, req, res, next) {
  let status = err.statusCode || 500,
    code = err.code || "SERVER_ERROR",
    message = err.message || "Unexpected server error";
  if (err.name === "ValidationError") {
    status = 400;
    code = "VALIDATION_ERROR";
    message = "Please check the submitted data";
  }
  if (err.name === "CastError") {
    status = 400;
    code = "INVALID_ID";
    message = "Invalid resource id";
  }
  if (err.code === 11000) {
    status = 409;
    code = "DUPLICATE_RESOURCE";
    message = "A record with this value already exists";
  }
  if (err.name === "ZodError") {
    status = 400;
    code = "VALIDATION_ERROR";
    message = err.issues?.map((i) => i.message).join(", ") || "Invalid input";
  }
  if (status >= 500)
    console.error(
      JSON.stringify({
        level: "error",
        message: err.message,
        stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
        requestId: req.id,
        method: req.method,
        path: req.originalUrl,
      }),
    );
  res.status(status).json({
    success: false,
    code,
    message,
    ...(process.env.NODE_ENV !== "production" && status >= 500
      ? { requestId: req.id }
      : {}),
  });
}
