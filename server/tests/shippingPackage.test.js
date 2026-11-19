import test from "node:test";
import assert from "node:assert/strict";
import { calculateShippingPackage } from "../src/utils/shippingPackage.js";

function item(quantity = 1, weight = 0.5) {
  return {
    quantity,
    shippingWeightKg: weight,
  };
}

test("uses the 5x4x2 inch box for 1 to 4 perfumes", () => {
  for (const quantity of [1, 2, 3, 4]) {
    const result = calculateShippingPackage([item(quantity)]);
    assert.equal(result.packages.length, 1);
    assert.equal(result.packages[0].height, 5.08);
    assert.equal(result.weight, Number((0.5 * quantity).toFixed(3)));
  }
});

test("uses the 5x4x3.5 inch box for 5 to 8 perfumes", () => {
  for (const quantity of [5, 6, 7, 8]) {
    const result = calculateShippingPackage([item(quantity)]);
    assert.equal(result.packages.length, 1);
    assert.equal(result.packages[0].height, 8.89);
    assert.equal(result.weight, Number((0.5 * quantity).toFixed(3)));
  }
});

test("combines quantities across different perfumes", () => {
  assert.equal(
    calculateShippingPackage([item(2, 0.4), item(3, 0.6)]).weight,
    2.6,
  );
});

test("splits 9 perfumes into one large and one small parcel", () => {
  const result = calculateShippingPackage([item(9)]);
  assert.deepEqual(
    result.packages.map(({ units, height }) => ({ units, height })),
    [
      { units: 8, height: 8.89 },
      { units: 1, height: 5.08 },
    ],
  );
});

test("splits 12 perfumes into one large and one small parcel", () => {
  const result = calculateShippingPackage([item(12)]);
  assert.deepEqual(
    result.packages.map(({ units, height }) => ({ units, height })),
    [
      { units: 8, height: 8.89 },
      { units: 4, height: 5.08 },
    ],
  );
});

test("splits 17 perfumes into 8, 8, and 1", () => {
  const result = calculateShippingPackage([item(17)]);
  assert.deepEqual(
    result.packages.map((parcel) => parcel.units),
    [8, 8, 1],
  );
});
