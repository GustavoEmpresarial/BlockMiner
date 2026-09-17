import test from "node:test";
import assert from "node:assert/strict";

const {
  snapWindowForType,
  snapWindowForActiveTournament,
} = await import("../../server/modules/tournaments/tournament-window.ts");

test("snapWindowForActiveTournament keeps DAILY on startsAt day (does not slide to now)", () => {
  const startsAt = new Date("2026-09-14T00:00:00.000Z");
  const endsAt = new Date("2026-09-15T00:00:00.000Z");
  const now = new Date("2026-09-15T02:13:00.000Z");
  const snap = snapWindowForActiveTournament("DAILY", startsAt, endsAt, now);
  assert.ok(snap);
  assert.equal(snap.start.toISOString(), "2026-09-14T00:00:00.000Z");
  assert.equal(snap.end.toISOString(), "2026-09-15T00:00:00.000Z");
});

test("snapWindowForType DAILY around prevEnd is the day containing the anchor", () => {
  const snap = snapWindowForType("DAILY", new Date("2026-09-14T00:00:00.000Z"));
  assert.equal(snap.start.toISOString(), "2026-09-14T00:00:00.000Z");
  assert.equal(snap.end.toISOString(), "2026-09-15T00:00:00.000Z");
});
