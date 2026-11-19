export function calculateShippingPackage(items) {
  const totalQuantity = items.reduce(
    (total, item) => total + item.quantity,
    0,
  );
  if (!Number.isInteger(totalQuantity) || totalQuantity < 1) {
    throw new RangeError("Packaging requires at least 1 perfume unit.");
  }

  const parcelUnitCount = [];
  let remaining = totalQuantity;
  while (remaining > 8) {
    parcelUnitCount.push(8);
    remaining -= 8;
  }
  if (remaining > 0) parcelUnitCount.push(remaining);

  const totalWeight = items.reduce(
    (total, item) => total + item.shippingWeightKg * item.quantity,
    0,
  );
  let weightToDistribute = totalWeight;
  const packages = parcelUnitCount.map((units, index) => {
    const isLast = index === parcelUnitCount.length - 1;
    const weight = isLast
      ? weightToDistribute
      : Number(
          (totalWeight * (units / totalQuantity)).toFixed(3),
        );
    weightToDistribute = Number(
      (weightToDistribute - weight).toFixed(3),
    );
    return {
      units,
      weight,
      length: 12.7,
      breadth: 10.16,
      height: units <= 4 ? 5.08 : 8.89,
    };
  });

  return {
    weight: Number(totalWeight.toFixed(3)),
    length: 12.7,
    breadth: 10.16,
    height: 8.89,
    packages,
  };
}
