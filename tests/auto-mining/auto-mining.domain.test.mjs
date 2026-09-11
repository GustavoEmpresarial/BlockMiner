import test from "node:test";
import assert from "node:assert/strict";

const {
  hasVerifiedPresence,
  canGrantDaily,
  computeExpiresAt,
  isClaimDue,
  isHeartbeatStale,
  resolveClaimReadiness,
  validateImpressionForTurboClaim,
  assertValidMiningMode,
  MINING_MODES,
  CLAIM_REQUIRED_SECONDS,
  HEARTBEAT_STALE_MS,
  DAILY_LIMIT_HASH,
} = await import("../../server/modules/auto-mining/auto-mining.domain.ts");

test("MINING_MODES — only NORMAL is available", () => {
  assert.equal(MINING_MODES.NORMAL, "NORMAL");
});

test("hasVerifiedPresence — true with sufficient seconds and recent heartbeat", () => {
  const now = new Date();
  const heartbeat = new Date(now.getTime() - 5000);
  assert.equal(hasVerifiedPresence(CLAIM_REQUIRED_SECONDS, heartbeat, now), true);
});

test("hasVerifiedPresence — false with insufficient seconds", () => {
  const now = new Date();
  const heartbeat = new Date(now.getTime() - 5000);
  assert.equal(hasVerifiedPresence(0, heartbeat, now), false);
});

test("hasVerifiedPresence — false without heartbeat", () => {
  assert.equal(hasVerifiedPresence(999, null, new Date()), false);
});

test("hasVerifiedPresence — false when heartbeat is stale", () => {
  const now = new Date();
  const oldHeartbeat = new Date(now.getTime() - HEARTBEAT_STALE_MS - 1000);
  assert.equal(hasVerifiedPresence(CLAIM_REQUIRED_SECONDS, oldHeartbeat, now), false);
});

test("canGrantDaily — true when under limit", () => {
  assert.equal(canGrantDaily(500, 200, 1000), true);
});

test("canGrantDaily — false when at limit", () => {
  assert.equal(canGrantDaily(900, 150, 1000), false);
});

test("canGrantDaily — false when over limit", () => {
  assert.equal(canGrantDaily(1000, 1, 1000), false);
});

test("canGrantDaily — uses DAILY_LIMIT_HASH as default limit", () => {
  assert.equal(canGrantDaily(0, DAILY_LIMIT_HASH), true);
  assert.equal(canGrantDaily(DAILY_LIMIT_HASH, 1), false);
});

test("isClaimDue — true when server time is after next claim", () => {
  const next = new Date(100000);
  const serverNow = new Date(110000);
  assert.equal(isClaimDue(next, serverNow), true);
});

test("isClaimDue — false when server time is before next claim", () => {
  const next = new Date(200000);
  const serverNow = new Date(100000);
  assert.equal(isClaimDue(next, serverNow), false);
});

test("isClaimDue — skewMs allows tolerance", () => {
  const next = new Date(100000);
  const serverNow = new Date(99500);
  assert.equal(isClaimDue(next, serverNow, 1000), true);
  assert.equal(isClaimDue(next, serverNow, 0), false);
});

test("isHeartbeatStale — exact threshold is still fresh", () => {
  const now = new Date(100000);
  assert.equal(isHeartbeatStale(new Date(100000 - HEARTBEAT_STALE_MS), now), false);
  assert.equal(isHeartbeatStale(new Date(100000 - HEARTBEAT_STALE_MS - 1), now), true);
  assert.equal(isHeartbeatStale(null, now), true);
});

test("resolveClaimReadiness — returns the decision-tree codes and retry hints", () => {
  const now = new Date(100000);
  const due = new Date(90000);
  const recent = new Date(now.getTime() - 1000);

  assert.deepEqual(resolveClaimReadiness({
    now,
    nextClaimAt: new Date(110000),
    boosted: false,
    lastHeartbeatAt: recent,
    secondsBalance: CLAIM_REQUIRED_SECONDS,
    paused: false,
  }), { ok: false, code: "CLAIM_NOT_DUE", retryAfterMs: 10000 });
  assert.deepEqual(resolveClaimReadiness({
    now,
    nextClaimAt: due,
    boosted: false,
    lastHeartbeatAt: new Date(now.getTime() - HEARTBEAT_STALE_MS - 1),
    secondsBalance: CLAIM_REQUIRED_SECONDS,
    paused: false,
  }), { ok: false, code: "PRESENCE_STALE", retryAfterMs: HEARTBEAT_STALE_MS });
  assert.deepEqual(resolveClaimReadiness({
    now,
    nextClaimAt: due,
    boosted: false,
    lastHeartbeatAt: recent,
    secondsBalance: CLAIM_REQUIRED_SECONDS - 1,
    paused: false,
  }), { ok: false, code: "PRESENCE_INSUFFICIENT", secondsShort: 1, retryAfterMs: 1000 });
  assert.deepEqual(resolveClaimReadiness({
    now,
    nextClaimAt: due,
    boosted: false,
    lastHeartbeatAt: null,
    secondsBalance: CLAIM_REQUIRED_SECONDS,
    paused: true,
  }), { ok: false, code: "SESSION_PAUSED" });
  assert.deepEqual(resolveClaimReadiness({
    now,
    nextClaimAt: due,
    boosted: true,
    lastHeartbeatAt: null,
    secondsBalance: 0,
    paused: false,
  }), { ok: true });
});

test("computeExpiresAt — adds TTL to earnedAt", () => {
  const earnedAt = new Date("2026-07-15T10:00:00.000Z");
  const result = computeExpiresAt(earnedAt, 60000);
  assert.equal(result.getTime(), earnedAt.getTime() + 60000);
});

test("validateImpressionForTurboClaim — accepts valid impression", () => {
  const now = new Date("2026-07-15T10:01:00Z");
  const createdAt = new Date("2026-07-15T10:00:00Z");
  const clickedAt = new Date("2026-07-15T10:00:05Z");
  const result = validateImpressionForTurboClaim({ clickedAt, grantId: null, createdAt }, now);
  assert.deepEqual(result, { ok: true });
});

test("validateImpressionForTurboClaim — rejects NOT_CLICKED", () => {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 10000);
  const result = validateImpressionForTurboClaim({ clickedAt: null, grantId: null, createdAt }, now);
  assert.deepEqual(result, { ok: false, code: "NOT_CLICKED" });
});

test("validateImpressionForTurboClaim — rejects ALREADY_CLAIMED", () => {
  const now = new Date();
  const result = validateImpressionForTurboClaim({ clickedAt: now, grantId: 42, createdAt: now }, now);
  assert.deepEqual(result, { ok: false, code: "ALREADY_CLAIMED" });
});

test("validateImpressionForTurboClaim — rejects CLICK_TOO_FAST", () => {
  const createdAt = new Date("2026-07-15T10:00:00Z");
  const clickedAt = new Date("2026-07-15T10:00:00.100Z");
  const now = new Date("2026-07-15T10:00:30Z");
  const result = validateImpressionForTurboClaim({ clickedAt, grantId: null, createdAt }, now);
  assert.deepEqual(result, { ok: false, code: "CLICK_TOO_FAST" });
});

test("validateImpressionForTurboClaim — rejects IMPRESSION_EXPIRED", () => {
  const createdAt = new Date("2026-07-15T10:00:00Z");
  const clickedAt = new Date("2026-07-15T10:00:05Z");
  const now = new Date("2026-07-15T11:00:00Z");
  const result = validateImpressionForTurboClaim({ clickedAt, grantId: null, createdAt }, now);
  assert.deepEqual(result, { ok: false, code: "IMPRESSION_EXPIRED" });
});

test("assertValidMiningMode — accepts NORMAL", () => {
  assert.equal(assertValidMiningMode("NORMAL"), "NORMAL");
});

test("assertValidMiningMode — throws for invalid mode", () => {
  assert.throws(() => assertValidMiningMode("TURBO"), /Invalid mining mode/);
  assert.throws(() => assertValidMiningMode(""), /Invalid mining mode/);
});
