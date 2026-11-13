const courierStrategies = ["lowest_cost", "fastest", "recommended"];

function positiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive number`);
  return parsed;
}

export function getShippingAutomationConfig() {
  return {
    enabled: process.env.SHIPROCKET_AUTO_BOOK_PAID_ORDERS === "true",
    courierSelection: courierStrategies.includes(
      process.env.SHIPROCKET_COURIER_SELECTION,
    )
      ? process.env.SHIPROCKET_COURIER_SELECTION
      : "lowest_cost",
    package: {
      length: positiveNumber(
        process.env.SHIPROCKET_PACKAGE_LENGTH_CM,
        "SHIPROCKET_PACKAGE_LENGTH_CM",
      ),
      breadth: positiveNumber(
        process.env.SHIPROCKET_PACKAGE_BREADTH_CM,
        "SHIPROCKET_PACKAGE_BREADTH_CM",
      ),
      height: positiveNumber(
        process.env.SHIPROCKET_PACKAGE_HEIGHT_CM,
        "SHIPROCKET_PACKAGE_HEIGHT_CM",
      ),
      tareWeight: positiveNumber(
        process.env.SHIPROCKET_PACKAGE_TARE_KG,
        "SHIPROCKET_PACKAGE_TARE_KG",
      ),
    },
  };
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function selectShiprocketCourier(couriers, strategy) {
  if (!couriers.length) return null;
  if (strategy === "recommended")
    return (
      couriers.find(
        (courier) =>
          courier.is_recommended === true ||
          courier.is_recommended === 1 ||
          courier.is_recommended === "1" ||
          Boolean(courier.recommended_by),
      ) || couriers[0]
    );

  const field =
    strategy === "fastest" ? "estimated_delivery_days" : "rate";
  const available = couriers
    .map((courier, index) => ({ courier, index, value: numericValue(courier[field]) }))
    .filter(({ value }) => value !== null);
  if (!available.length) return couriers[0];
  available.sort(
    (left, right) =>
      left.value - right.value || left.index - right.index,
  );
  return available[0].courier;
}
