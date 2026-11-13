export function calculateShippingPackage(items) {
  const packageData = {
    weight: Number(
      items
        .reduce(
          (total, item) => total + item.shippingWeightKg * item.quantity,
          0,
        )
        .toFixed(3),
    ),
  };
  const hasDimensions = items.every(
    (item) =>
      Number.isFinite(item.shippingLengthCm) &&
      item.shippingLengthCm > 0 &&
      Number.isFinite(item.shippingBreadthCm) &&
      item.shippingBreadthCm > 0 &&
      Number.isFinite(item.shippingHeightCm) &&
      item.shippingHeightCm > 0,
  );
  if (!hasDimensions) return packageData;

  return {
    ...packageData,
    length: Math.max(...items.map((item) => item.shippingLengthCm)),
    breadth: Math.max(...items.map((item) => item.shippingBreadthCm)),
    height: Number(
      items
        .reduce(
          (total, item) => total + item.shippingHeightCm * item.quantity,
          0,
        )
        .toFixed(2),
    ),
  };
}
