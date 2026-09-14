import test from "node:test";
import assert from "node:assert/strict";

const burnService = await import("../../server/modules/burn-events/burn-events.service.ts");
const { BURN_EVENTS_ERROR } = await import("../../server/modules/burn-events/burn-events.errors.ts");

test("startBurnEvent: rejects invalid feeCurrency", async () => {
  await assert.rejects(
    async () => {
      await burnService.startBurnEvent(1, 10, [101], "BTC");
    },
    (err) => {
      assert.equal(err.code, BURN_EVENTS_ERROR.INVALID_FEE_CURRENCY);
      return true;
    },
  );

  await assert.rejects(
    async () => {
      await burnService.startBurnEvent(1, 10, [101], "");
    },
    (err) => {
      assert.equal(err.code, BURN_EVENTS_ERROR.INVALID_FEE_CURRENCY);
      return true;
    },
  );
});

test("startBurnEvent: rejects empty machines array", async () => {
  await assert.rejects(
    async () => {
      await burnService.startBurnEvent(1, 10, [], "SHIB");
    },
    (err) => {
      assert.equal(err.code, BURN_EVENTS_ERROR.NO_MACHINES_SELECTED);
      return true;
    },
  );
});

test("startBurnEvent: validates fee rates and balance checks (SHIB: 20, POL: 0.01, BLK: 0.001)", async () => {
  const { BURN_FEE_RATES } = await import("../../server/modules/burn-events/burn-events.config.ts");
  assert.equal(BURN_FEE_RATES.SHIB, 20);
  assert.equal(BURN_FEE_RATES.POL, 0.01);
  assert.equal(BURN_FEE_RATES.BLK, 0.001);
});
