import { createHmac, randomBytes } from "node:crypto";
import AppError from "../utils/AppError.js";

const apiBase = "https://apiv2.shiprocket.in/v1/external";
let cachedToken = "";
let tokenExpiresAt = 0;
let cachedTokenFingerprint = "";
const authCircuitSecret = randomBytes(32);
const blockedCredentialFingerprints = new Set();
let pendingAuthRequest = null;

function credentialFingerprint(email, password) {
  return createHmac("sha256", authCircuitSecret)
    .update(`${email}\0${password}`)
    .digest("hex");
}

async function responseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new AppError(
      data.message || data.errors?.message || "Shiprocket request failed",
      502,
      "SHIPROCKET_ERROR",
    );
  return data;
}

async function requestToken(email, password, fingerprint) {
  const response = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message = data.message || data.errors?.message || "";
    if (/blocked due to too many failed login attempts/i.test(message)) {
      blockedCredentialFingerprints.add(fingerprint);
      throw new AppError(
        "Shiprocket API login is blocked after too many failed attempts. Verify SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD, then contact Shiprocket to unblock the account. Automatic retries are paused for these credentials.",
        503,
        "SHIPROCKET_AUTH_BLOCKED",
      );
    }
    throw new AppError(
      message || "Shiprocket request failed",
      502,
      "SHIPROCKET_ERROR",
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!data.token)
    throw new AppError("Shiprocket authentication returned no token", 502);
  cachedToken = data.token;
  tokenExpiresAt = Date.now() + 7 * 60 * 60 * 1000;
  cachedTokenFingerprint = fingerprint;
  return cachedToken;
}

async function getToken() {
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password)
    throw new AppError(
      "Shiprocket is not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD on the server.",
      503,
      "SHIPROCKET_NOT_CONFIGURED",
    );
  const fingerprint = credentialFingerprint(email, password);
  if (
    cachedToken &&
    tokenExpiresAt > Date.now() &&
    cachedTokenFingerprint === fingerprint
  )
    return cachedToken;
  if (blockedCredentialFingerprints.has(fingerprint))
    throw new AppError(
      "Shiprocket API login is paused after too many failed attempts. Verify SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD, then contact Shiprocket to unblock the account before retrying.",
      503,
      "SHIPROCKET_AUTH_BLOCKED",
    );
  if (pendingAuthRequest?.fingerprint === fingerprint)
    return pendingAuthRequest.promise;

  const promise = requestToken(email, password, fingerprint);
  pendingAuthRequest = { fingerprint, promise };
  try {
    return await promise;
  } finally {
    if (pendingAuthRequest?.promise === promise) pendingAuthRequest = null;
  }
}

export async function shiprocketRequest(path, { method = "POST", body } = {}) {
  const token = await getToken();
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return responseJson(response);
}

export async function getShiprocketCouriers({
  deliveryPostalCode,
  weight,
  declaredValue,
}) {
  const pickupPostalCode = process.env.SHIPROCKET_PICKUP_POSTCODE;
  if (!pickupPostalCode)
    throw new AppError(
      "Set SHIPROCKET_PICKUP_POSTCODE to find available couriers",
      503,
      "SHIPROCKET_NOT_CONFIGURED",
    );
  const query = new URLSearchParams({
    pickup_postcode: pickupPostalCode,
    delivery_postcode: deliveryPostalCode,
    weight: String(weight),
    cod: "0",
    declared_value: String(declaredValue),
  });
  const result = await shiprocketRequest(
    `/courier/serviceability/?${query}`,
    { method: "GET" },
  );
  return result.data?.available_courier_companies || [];
}

export async function createShiprocketOrder(order, packageDetails) {
  const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION;
  if (!pickupLocation)
    throw new AppError(
      "Set SHIPROCKET_PICKUP_LOCATION to a pickup location configured in Shiprocket",
      503,
      "SHIPROCKET_NOT_CONFIGURED",
    );
  const result = await shiprocketRequest("/orders/create/adhoc", {
    body: {
      order_id: `DV-${order._id}`,
      order_date: new Date().toISOString().slice(0, 16).replace("T", " "),
      pickup_location: pickupLocation,
      comment: "Divine Vikas customer order",
      billing_customer_name: order.shippingAddress.fullName,
      billing_last_name: "",
      billing_address: order.shippingAddress.line1,
      billing_address_2: order.shippingAddress.line2 || "",
      billing_city: order.shippingAddress.city,
      billing_pincode: order.shippingAddress.postalCode,
      billing_state: order.shippingAddress.state,
      billing_country: order.shippingAddress.country || "India",
      billing_email: order.user?.email || "",
      billing_phone: order.shippingAddress.phone.replace(/[^0-9]/g, "").slice(-10),
      shipping_is_billing: true,
      order_items: order.items.map((item, index) => ({
        name: item.name,
        sku: String(item.product),
        units: item.quantity,
        selling_price: item.price,
        discount: 0,
        tax: 0,
        hsn: "",
      })),
      payment_method: "Prepaid",
      sub_total: Number(
        (order.subtotal ?? order.total - (order.shippingCost || 0)).toFixed(2),
      ),
      shipping_charges: Number((order.shippingCost || 0).toFixed(2)),
      length: packageDetails.length,
      breadth: packageDetails.breadth,
      height: packageDetails.height,
      weight: packageDetails.weight,
    },
  });
  const findIdentifier = (value, type, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 5) return null;
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = findIdentifier(entry, type, depth + 1);
        if (found) return found;
      }
      return null;
    }
    const directValue = type === "order"
      ? value.order_id
      : value.shipment_id || value.shipment?.id || value.shipments?.[0]?.id;
    if (directValue) return directValue;
    for (const nested of Object.values(value)) {
      const found = findIdentifier(nested, type, depth + 1);
      if (found) return found;
    }
    return null;
  };
  const orderId = findIdentifier(result, "order");
  const shipmentId = findIdentifier(result, "shipment");
  if (!orderId || !shipmentId) {
    const responseMessage =
      typeof result.message === "string" ? result.message : "";
    if (/wrong pickup location/i.test(responseMessage))
      throw new AppError(
        "Shiprocket rejected the order: Wrong pickup location. Set SHIPROCKET_PICKUP_LOCATION to an exact pickup location name from your Shiprocket account, then retry.",
        502,
        "SHIPROCKET_INVALID_PICKUP_LOCATION",
      );
    throw new AppError(
      `Shiprocket did not return order/shipment IDs${responseMessage ? `: ${responseMessage.slice(0, 180)}` : "."} Check the Shiprocket dashboard before retrying to avoid a duplicate shipment.`,
      502,
      "SHIPROCKET_INVALID_RESPONSE",
    );
  }
  return { ...result, order_id: orderId, shipment_id: shipmentId };
}

function findNestedValue(value, keys, depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return undefined;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findNestedValue(entry, keys, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== "")
      return value[key];
  }
  for (const nested of Object.values(value)) {
    const found = findNestedValue(nested, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

function providerMessage(value) {
  const message = findNestedValue(value, ["message", "error", "errors"]);
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.filter(Boolean).join("; ");
  if (message && typeof message === "object")
    return Object.values(message)
      .flatMap((entry) => Array.isArray(entry) ? entry : [entry])
      .filter((entry) => typeof entry === "string" && entry)
      .join("; ");
  return "";
}

export async function assignShiprocketCourier(shipmentId, courierId) {
  const result = await shiprocketRequest("/courier/assign/awb", {
    body: { shipment_id: Number(shipmentId), courier_id: Number(courierId) },
  });
  const awbCode = findNestedValue(result, ["awb_code"]);
  if (!awbCode) {
    const message = providerMessage(result);
    if (/processing your request/i.test(message))
      throw new AppError(
        "Shiprocket is still processing the AWB assignment. The shipment order already exists; check it in Shiprocket before retrying this action.",
        409,
        "SHIPROCKET_AWB_PENDING",
      );
    throw new AppError(
      message
        ? `Shiprocket could not assign an AWB: ${message.slice(0, 250)}`
        : "Shiprocket did not return an AWB code or an explanation. Check the shipment in Shiprocket before retrying.",
      502,
      "SHIPROCKET_AWB_FAILED",
    );
  }
  return {
    ...result,
    awb_code: awbCode,
    courier_name: findNestedValue(result, ["courier_name", "courier_company_name"]),
  };
}

export async function generateShiprocketLabel(shipmentId) {
  return shiprocketRequest("/courier/generate/label", {
    body: { shipment_id: [Number(shipmentId)] },
  });
}
