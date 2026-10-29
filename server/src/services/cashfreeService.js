import AppError from "../utils/AppError.js";

const cashfreeBase = () =>
  process.env.CASHFREE_ENV === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

export async function cashfreeRequest(
  path,
  { method = "POST", body, headers = {} } = {},
) {
  if (!process.env.CASHFREE_CLIENT_ID || !process.env.CASHFREE_CLIENT_SECRET)
    throw new AppError(
      "Cashfree is not configured. Set CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET in server/.env",
      503,
      "PAYMENTS_NOT_CONFIGURED",
    );
  const response = await fetch(`${cashfreeBase()}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      "x-api-version": "2023-08-01",
      "x-client-id": process.env.CASHFREE_CLIENT_ID,
      "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new AppError(
      data.message || "Cashfree payment request failed",
      502,
      "CASHFREE_ERROR",
    );
  return data;
}

export const cashfreeEnvironment = () =>
  process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";
