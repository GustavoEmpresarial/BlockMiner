import test from "node:test";
import assert from "node:assert/strict";

const svc = await import("../../server/modules/public-stats/public-stats.service.ts");

test("estimateNetworkHashRateHs: zero rigs falls back to MIN_NETWORK_HS floor", () => {
  assert.equal(svc.estimateNetworkHashRateHs(0), svc.MIN_NETWORK_HS);
  assert.equal(svc.estimateNetworkHashRateHs(null), svc.MIN_NETWORK_HS);
});

test("estimateNetworkHashRateHs: scales by HS_PER_ACTIVE_RIG, floored at MIN_NETWORK_HS", () => {
  assert.equal(svc.estimateNetworkHashRateHs(10), Math.max(10 * svc.HS_PER_ACTIVE_RIG, svc.MIN_NETWORK_HS));
  assert.equal(svc.estimateNetworkHashRateHs(1000), 1000 * svc.HS_PER_ACTIVE_RIG);
});

test("getPublicLiveStats: resolves against live dev DB with the full legacy field set", async () => {
  const stats = await svc.getPublicLiveStats();
  for (const key of [
    "generatedAt",
    "usersTotal",
    "newUsers24h",
    "polInUserBalances",
    "polDepositedTotal",
    "polWithdrawnTotal",
    "activeMiners",
    "totalTransactions",
    "networkHashRate",
    "networkDifficulty",
    "rewardPerBlockPol",
    "blkCycleReward",
    "avgBlockSeconds",
    "blockTimeLabel",
    "frequencyLabel",
    "rewardPolLabel",
    "rewardBlkLabel",
    "recentBlocks",
  ]) {
    assert.ok(key in stats, `missing field: ${key}`);
  }
  assert.ok(Array.isArray(stats.recentBlocks));
});
