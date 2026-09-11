import test from "node:test";
import assert from "node:assert/strict";

const dto = await import("../../server/modules/faucet/faucet.dto.ts");

test("buildStatusCore: no record means immediately available", () => {
  const result = dto.buildStatusCore(null, new Date(), 3_600_000);
  assert.equal(result.available, true);
  assert.equal(result.remainingMs, 0);
  assert.equal(result.totalClaims, 0);
});

test("buildStatusCore: within cooldown window is unavailable with remaining time", () => {
  const claimedAt = new Date("2026-01-01T00:00:00Z");
  const now = new Date("2026-01-01T00:30:00Z");
  const result = dto.buildStatusCore({ claimedAt, totalClaims: 2 }, now, 3_600_000);
  assert.equal(result.available, false);
  assert.equal(result.remainingMs, 1_800_000);
  assert.equal(result.totalClaims, 2);
});

test("buildStatusCore: cooldown fully elapsed is available again", () => {
  const claimedAt = new Date("2026-01-01T00:00:00Z");
  const now = new Date("2026-01-01T02:00:00Z");
  const result = dto.buildStatusCore({ claimedAt, totalClaims: 1 }, now, 3_600_000);
  assert.equal(result.available, true);
  assert.equal(result.remainingMs, 0);
});

test("mapPublicReward always marks faucet rewards as temporary power", () => {
  const fake = dto.mapPublicReward({ rewardId: 1, cooldownMs: 3_600_000, miner: { id: 999999, name: "x", baseHashRate: 10, slotSize: 0, imageUrl: null } }, 24);
  assert.equal(fake.inventoryPermanent, false);
  assert.equal(fake.rewardDurationHours, 24);

  const real = dto.mapPublicReward({ rewardId: 1, cooldownMs: 3_600_000, miner: { id: 5, name: "Real Rig", baseHashRate: 50, slotSize: 1, imageUrl: null } }, 168);
  assert.equal(real.inventoryPermanent, false);
  assert.equal(real.rewardDurationHours, 168);
});
