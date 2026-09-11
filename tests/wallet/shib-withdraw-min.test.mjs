import test from "node:test";
import assert from "node:assert/strict";

const { computeMinShibFromUsd } = await import("../../server/modules/wallet/wallet.types.ts");

test("computeMinShibFromUsd ceils $0.10 at typical SHIB price", () => {
  // 0.10 / 0.00001 = 10000
  assert.equal(computeMinShibFromUsd(0.1, 0.00001), 10_000);
});

test("computeMinShibFromUsd ceils fractional SHIB units", () => {
  // 0.10 / 0.000012 = 8333.33… → 8334
  assert.equal(computeMinShibFromUsd(0.1, 0.000012), 8334);
});

test("computeMinShibFromUsd returns 0 for bad inputs", () => {
  assert.equal(computeMinShibFromUsd(0.1, 0), 0);
  assert.equal(computeMinShibFromUsd(0, 0.00001), 0);
  assert.equal(computeMinShibFromUsd(-1, 0.00001), 0);
});
