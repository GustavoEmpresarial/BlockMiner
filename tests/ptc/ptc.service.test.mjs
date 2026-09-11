import test from "node:test";
import assert from "node:assert/strict";

const svc = await import("../../server/modules/ptc/ptc.service.ts");
const types = await import("../../server/modules/ptc/ptc.types.ts");

function session(overrides = {}) {
  return {
    id: "s1",
    status: "viewing",
    lastHeartbeatAt: null,
    startedAt: new Date("2026-08-08T10:00:00.000Z"),
    completedAt: null,
    ...overrides,
  };
}

test("isSessionStale: cancels an in-progress session with no heartbeat past SESSION_STALE_MS", () => {
  const now = new Date("2026-08-08T10:00:00.000Z");
  const startedAt = new Date(now.getTime() - types.SESSION_STALE_MS - 1);
  assert.equal(svc.isSessionStale(session({ startedAt, lastHeartbeatAt: null }), now), true);
});

test("isSessionStale: not stale when within SESSION_STALE_MS of last heartbeat", () => {
  const now = new Date("2026-08-08T10:00:00.000Z");
  const lastHeartbeatAt = new Date(now.getTime() - (types.SESSION_STALE_MS - 1000));
  assert.equal(svc.isSessionStale(session({ lastHeartbeatAt }), now), false);
});

test("isSessionStale: completed session becomes stale after SESSION_CLAIM_WINDOW_MS unclaimed", () => {
  const now = new Date("2026-08-08T10:00:00.000Z");
  const completedAt = new Date(now.getTime() - types.SESSION_CLAIM_WINDOW_MS - 1);
  assert.equal(svc.isSessionStale(session({ status: "completed", completedAt }), now), true);
});

test("isSessionStale: completed session within claim window is not stale", () => {
  const now = new Date("2026-08-08T10:00:00.000Z");
  const completedAt = new Date(now.getTime() - 1000);
  assert.equal(svc.isSessionStale(session({ status: "completed", completedAt }), now), false);
});

test("isSessionStale: completed session with no completedAt is treated as stale (defensive)", () => {
  const now = new Date("2026-08-08T10:00:00.000Z");
  assert.equal(svc.isSessionStale(session({ status: "completed", completedAt: null }), now), true);
});

test("anti-cheat constants preserved from legacy (HEARTBEAT_MAX_GAP_MS caps per-tick credit)", () => {
  assert.equal(types.HEARTBEAT_MAX_GAP_MS, 15_000);
  assert.equal(types.SESSION_STALE_MS, 90_000);
  assert.equal(types.SESSION_CLAIM_WINDOW_MS, 2 * 60 * 60 * 1000);
});
