import "dotenv/config";
const required = ["MONGODB_URI", "ACCESS_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"];
for (const key of required) {
  if (!process.env[key])
    throw new Error(`Missing required environment variable: ${key}`);
}
if (
  process.env.NODE_ENV === "production" &&
  [process.env.ACCESS_TOKEN_SECRET, process.env.REFRESH_TOKEN_SECRET].some(
    (v) => v.length < 32,
  )
)
  throw new Error("JWT secrets must be at least 32 characters in production");
export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI,
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  imageOrigins: (
    process.env.IMAGE_ORIGINS ||
    `http://localhost:${Number(process.env.PORT) || 5000},http://127.0.0.1:${Number(process.env.PORT) || 5000}`
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  accessSecret: process.env.ACCESS_TOKEN_SECRET,
  refreshSecret: process.env.REFRESH_TOKEN_SECRET,
  accessTtl: process.env.ACCESS_TOKEN_TTL || "10m",
  refreshDays: Number(process.env.REFRESH_TOKEN_DAYS) || 7,
  sameSite: process.env.COOKIE_SAME_SITE || "lax",
};
