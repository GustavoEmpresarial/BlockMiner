import test from "node:test";
import assert from "node:assert/strict";

const {
  DEFAULT_BURN_CLAIM_LIMIT_PER_USER,
  DEFAULT_BURN_STOCK_TOTAL,
  DEFAULT_MAX_BURN_OWNED_MACHINE_IDS,
  MAX_BURN_CLAIM_LIMIT_PER_USER,
  normalizeClaimLimitPerUser,
  normalizeStockTotal,
  readDefaultBurnClaimLimitPerUser,
  readMaxBurnOwnedMachineIds,
} = await import("../../server/modules/burn-events/burn-events.config.ts");

test("product default is 10 burns per user, not 1, and stock is unlimited", () => {
  assert.equal(DEFAULT_BURN_CLAIM_LIMIT_PER_USER, 10);
  assert.equal(DEFAULT_BURN_STOCK_TOTAL, null);
  assert.equal(readDefaultBurnClaimLimitPerUser(""), 10);
  assert.equal(readDefaultBurnClaimLimitPerUser(null), 10);
});

test("normalizeClaimLimitPerUser never confuses a missing value with a global pool of 10", () => {
  assert.equal(normalizeClaimLimitPerUser(undefined), 10);
  assert.equal(normalizeClaimLimitPerUser(null), 10);
  assert.equal(normalizeClaimLimitPerUser(1), 1);
  assert.equal(normalizeClaimLimitPerUser(10), 10);
  assert.equal(normalizeClaimLimitPerUser(0), 1);
  assert.equal(normalizeClaimLimitPerUser(-3), 1);
  assert.equal(normalizeClaimLimitPerUser(MAX_BURN_CLAIM_LIMIT_PER_USER + 50), MAX_BURN_CLAIM_LIMIT_PER_USER);
});

test("normalizeStockTotal: empty means unlimited global pool, never the per-user limit", () => {
  assert.equal(normalizeStockTotal(undefined), null);
  assert.equal(normalizeStockTotal(null), null);
  assert.equal(normalizeStockTotal(""), null);
  assert.equal(normalizeStockTotal(0), null);
  assert.equal(normalizeStockTotal(10), 10);
  assert.equal(normalizeStockTotal(250), 250);
});

test("MAX_BURN_OWNED_MACHINE_IDS is a DoS input cap, not a 10-machine product rule", () => {
  assert.ok(DEFAULT_MAX_BURN_OWNED_MACHINE_IDS > 10);
  assert.equal(readMaxBurnOwnedMachineIds(""), DEFAULT_MAX_BURN_OWNED_MACHINE_IDS);
  assert.equal(readMaxBurnOwnedMachineIds("100"), 100);
});
