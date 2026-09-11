import test from "node:test";
import assert from "node:assert/strict";

const profit = await import("../../server/modules/transparency/transparency.hardware-profit.ts");

test("computeEarnedUsd converts satoshis with BTC/USD snapshot", () => {
  const usd = profit.computeEarnedUsd(100_000_000n, 50_000);
  assert.equal(usd, 50_000);
  const partial = profit.computeEarnedUsd(50_000n, 100_000);
  assert.equal(partial, 50);
});

test("parseSatoshiInput rejects invalid values", () => {
  assert.equal(profit.parseSatoshiInput("12345"), 12345n);
  assert.equal(profit.parseSatoshiInput("12,345 sats"), 12345n);
  assert.equal(profit.parseSatoshiInput(0), null);
  assert.equal(profit.parseSatoshiInput(""), null);
});

test("computeHardwareRoiSummary tracks recovery and ROI estimate", () => {
  const summary = profit.computeHardwareRoiSummary(640, [
    { earnedAt: new Date("2026-01-01"), earnedUsd: 32, satoshiAmount: 100000n },
    { earnedAt: new Date("2026-01-31"), earnedUsd: 32, satoshiAmount: 100000n },
  ]);
  assert.equal(summary.totalEarnedSatoshi, "200000");
  assert.equal(summary.totalEarnedUsd, 64);
  assert.equal(summary.recoveredPct, 10);
  assert.equal(summary.remainingUsd, 576);
  assert.equal(summary.roiReached, false);
  assert.ok(summary.avgDailyUsd != null && summary.avgDailyUsd > 0);
  assert.ok(summary.estimatedDaysToRoi != null && summary.estimatedDaysToRoi > 0);
});

test("computeHardwareRoiSummary marks ROI reached", () => {
  const summary = profit.computeHardwareRoiSummary(640, [
    { earnedAt: new Date("2026-02-01"), earnedUsd: 700 },
  ]);
  assert.equal(summary.roiReached, true);
  assert.equal(summary.remainingUsd, 0);
});
