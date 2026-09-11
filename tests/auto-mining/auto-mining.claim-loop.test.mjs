import test from "node:test";
import assert from "node:assert/strict";

const {
  AUTO_MINING_STALL_REPORT_AFTER_CYCLES,
  shouldCountAsStalledCycle,
  isClaimTargetDue,
  adoptLaterNextClaimAt,
  isBenignAutoMiningStallCode,
} = await import("../../client/src/features/auto-mining/lib/autoMiningClaimLoop.ts");

test("stall threshold stays at three unexpected cycles", () => {
  assert.equal(AUTO_MINING_STALL_REPORT_AFTER_CYCLES, 3);
});

test("CLAIM_NOT_DUE with retryAfterMs is not a stalled cycle", () => {
  assert.equal(shouldCountAsStalledCycle("CLAIM_NOT_DUE", 266), false);
  assert.equal(shouldCountAsStalledCycle("CLAIM_NOT_DUE", 59000), false);
  assert.equal(shouldCountAsStalledCycle("CLAIM_NOT_DUE", 1), false);
});

test("CLAIM_NOT_DUE never counts as a stalled cycle", () => {
  assert.equal(shouldCountAsStalledCycle("CLAIM_NOT_DUE", 0), false);
  assert.equal(shouldCountAsStalledCycle("CLAIM_NOT_DUE", undefined), false);
});

test("presence / pause wait codes are not stalled cycles", () => {
  assert.equal(shouldCountAsStalledCycle("PRESENCE_STALE", 40000), false);
  assert.equal(shouldCountAsStalledCycle("PRESENCE_INSUFFICIENT", 5000), false);
  assert.equal(shouldCountAsStalledCycle("SESSION_PAUSED", undefined), false);
});

test("unknown codes still count as stalled", () => {
  assert.equal(shouldCountAsStalledCycle("WRONG_MODE", 0), true);
  assert.equal(shouldCountAsStalledCycle(undefined, 100), true);
});

test("isClaimTargetDue uses milliseconds, not ceiled seconds", () => {
  const target = "2026-09-02T12:00:00.400Z";
  assert.equal(isClaimTargetDue(target, Date.parse("2026-09-02T12:00:00.000Z")), false);
  assert.equal(isClaimTargetDue(target, Date.parse("2026-09-02T12:00:00.400Z")), true);
  assert.equal(isClaimTargetDue(target, Date.parse("2026-09-02T12:00:00.401Z")), true);
});

test("adoptLaterNextClaimAt refuses to rewind", () => {
  const later = "2026-09-02T12:01:00.000Z";
  const earlier = "2026-09-02T12:00:00.000Z";
  assert.equal(adoptLaterNextClaimAt(later, earlier), later);
  assert.equal(adoptLaterNextClaimAt(earlier, later), later);
  assert.equal(adoptLaterNextClaimAt(null, later), later);
  assert.equal(adoptLaterNextClaimAt(later, null), later);
});

test("benign stall codes match the admin flood", () => {
  assert.equal(isBenignAutoMiningStallCode("CLAIM_NOT_DUE"), true);
  assert.equal(isBenignAutoMiningStallCode("DAILY_LIMIT"), false);
});
