import test from "node:test";
import assert from "node:assert/strict";

const anticheat = await import("../../server/modules/games/games.anti-cheat.ts");

test("evaluateTrust rejects a win that finishes faster than the game's minimum duration", () => {
  const result = anticheat.evaluateTrust("crypto-memory", 100, 50);
  assert.ok(result.events.includes("timing_below_minimum"));
  assert.equal(result.rejected, true);
});

test("evaluateTrust accepts a plausible, slow-enough win with a positive score", () => {
  const result = anticheat.evaluateTrust("crypto-memory", 10_000, 50);
  assert.deepEqual(result.events, []);
  assert.equal(result.rejected, false);
  assert.equal(result.trustScore, 100);
});

test("evaluateCartRushTrust flags a score/distance mismatch as anomalous", () => {
  const result = anticheat.evaluateCartRushTrust(20_000, 1000, 2, 999999);
  assert.ok(result.events.includes("score_anomaly"));
});
