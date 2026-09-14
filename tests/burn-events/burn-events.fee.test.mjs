import test from "node:test";
import assert from "node:assert/strict";

const {
  BURN_FEE_RATES,
  ALLOWED_BURN_FEE_CURRENCIES,
  isAllowedBurnFeeCurrency,
  getBurnFeeAmount,
} = await import("../../server/modules/burn-events/burn-events.config.ts");

const {
  BURN_EVENTS_ERROR,
  httpStatusForBurnCode,
} = await import("../../server/modules/burn-events/burn-events.errors.ts");

test("burn fee rates match exact business specification", () => {
  assert.equal(BURN_FEE_RATES.SHIB, 20);
  assert.equal(BURN_FEE_RATES.POL, 0.01);
  assert.equal(BURN_FEE_RATES.BLK, 0.001);
});

test("allowed burn fee currencies only include SHIB, POL, BLK", () => {
  assert.deepEqual([...ALLOWED_BURN_FEE_CURRENCIES].sort(), ["BLK", "POL", "SHIB"]);

  assert.equal(isAllowedBurnFeeCurrency("SHIB"), true);
  assert.equal(isAllowedBurnFeeCurrency("POL"), true);
  assert.equal(isAllowedBurnFeeCurrency("BLK"), true);

  assert.equal(isAllowedBurnFeeCurrency("BTC"), false);
  assert.equal(isAllowedBurnFeeCurrency("ETH"), false);
  assert.equal(isAllowedBurnFeeCurrency("USDT"), false);
  assert.equal(isAllowedBurnFeeCurrency(""), false);
  assert.equal(isAllowedBurnFeeCurrency(null), false);
  assert.equal(isAllowedBurnFeeCurrency(undefined), false);
});

test("getBurnFeeAmount retrieves expected amount per currency", () => {
  assert.equal(getBurnFeeAmount("SHIB"), 20);
  assert.equal(getBurnFeeAmount("POL"), 0.01);
  assert.equal(getBurnFeeAmount("BLK"), 0.001);
});

test("burn fee errors map to HTTP 400", () => {
  assert.equal(httpStatusForBurnCode(BURN_EVENTS_ERROR.INVALID_FEE_CURRENCY), 400);
  assert.equal(httpStatusForBurnCode(BURN_EVENTS_ERROR.INSUFFICIENT_FEE_BALANCE), 400);
});
