import AppError from "../utils/AppError.js";

const apiBase = "https://apiv2.shiprocket.in/v1/external";
let cachedToken = "";
let tokenExpiresAt = 0;

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

async function getToken() {
  if (cachedToken && tokenExpiresAt > Date.now()) return cachedToken;
  const email = process.env.SHIPROCKET_EMAIL;
  const password = process.env.SHIPROCKET_PASSWORD;
  if (!email || !password)
    throw new AppError(
      "Shiprocket is not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD on the server.",
      503,
      "SHIPROCKET_NOT_CONFIGURED",
    );
  const response = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await responseJson(response);
  if (!data.token)
    throw new AppError("Shiprocket authentication returned no token", 502);
  cachedToken = data.token;
  tokenExpiresAt = Date.now() + 7 * 60 * 60 * 1000;
  return cachedToken;
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
  return shiprocketRequest("/orders/create/adhoc", {
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
      sub_total: order.total,
      length: packageDetails.length,
      breadth: packageDetails.breadth,
      height: packageDetails.height,
      weight: packageDetails.weight,
    },
  });
}

export async function assignShiprocketCourier(shipmentId, courierId) {
  return shiprocketRequest("/courier/assign/awb", {
    body: { shipment_id: Number(shipmentId), courier_id: Number(courierId) },
  });
}

export async function generateShiprocketLabel(shipmentId) {
  return shiprocketRequest("/courier/generate/label", {
    body: { shipment_id: [Number(shipmentId)] },
  });
}
