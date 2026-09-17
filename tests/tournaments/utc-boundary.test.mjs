/**
 * Behaviour of the tournament window math exactly at 00:00 UTC.
 *
 * Midnight UTC is when every DAILY tournament rolls over: the old one is
 * finalized, the next cycle is spawned, and scoring switches windows. These
 * tests pin that behaviour at the exact instant, including the off-by-one
 * neighbourhood around it (‑1ms / +1ms).
 *
 * One top-level await; do not add another further down (node:test registers
 * anything after a mid-file top-level await too late to run).
 */
import test from "node:test";
import assert from "node:assert/strict";

const BASE = "../../server/modules/tournaments";
const [windows, types] = await Promise.all([
  import(`${BASE}/tournament-window.ts`),
  import(`${BASE}/tournaments.types.ts`),
]);

const MIDNIGHT = new Date("2026-09-18T00:00:00.000Z");
const ONE_MS = 1;

// ─── the instant itself belongs to the NEW day ───────────────────────────────

test("00:00:00.000 UTC starts the new daily window, it does not end the old one", () => {
  const snap = windows.snapWindowForType("DAILY", MIDNIGHT);
  assert.equal(snap.start.toISOString(), "2026-09-18T00:00:00.000Z");
  assert.equal(snap.end.toISOString(), "2026-09-19T00:00:00.000Z");
});

test("one millisecond before midnight still belongs to the old day", () => {
  const snap = windows.snapWindowForType("DAILY", new Date(MIDNIGHT.getTime() - ONE_MS));
  assert.equal(snap.start.toISOString(), "2026-09-17T00:00:00.000Z");
  assert.equal(snap.end.toISOString(), "2026-09-18T00:00:00.000Z");
});

test("one millisecond after midnight belongs to the new day", () => {
  const snap = windows.snapWindowForType("DAILY", new Date(MIDNIGHT.getTime() + ONE_MS));
  assert.equal(snap.start.toISOString(), "2026-09-18T00:00:00.000Z");
});

// ─── adjacent windows tile without gap ───────────────────────────────────────

test("consecutive daily windows leave no uncovered millisecond", () => {
  // A gap here would mean events landing in NO tournament at the rollover.
  const day1 = windows.snapWindowForType("DAILY", new Date("2026-09-17T12:00:00.000Z"));
  const day2 = windows.snapWindowForType("DAILY", new Date("2026-09-18T12:00:00.000Z"));
  assert.equal(day1.end.getTime(), day2.start.getTime(), "daily windows must tile exactly");
});

test("weekly windows tile across the Sunday→Monday rollover", () => {
  const w1 = windows.snapWindowForType("WEEKLY", new Date("2026-09-16T12:00:00.000Z"));
  const w2 = windows.snapWindowForType("WEEKLY", new Date("2026-09-21T12:00:00.000Z"));
  assert.equal(w1.end.toISOString(), "2026-09-21T00:00:00.000Z");
  assert.equal(w1.end.getTime(), w2.start.getTime());
});

test("monthly windows tile across the month-end rollover", () => {
  const m1 = windows.snapWindowForType("MONTHLY", new Date("2026-09-30T23:59:59.999Z"));
  const m2 = windows.snapWindowForType("MONTHLY", new Date("2026-10-01T00:00:00.000Z"));
  assert.equal(m1.end.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(m1.end.getTime(), m2.start.getTime());
});

test("a monthly window rolls correctly across the new year at 00:00 UTC", () => {
  const dec = windows.snapWindowForType("MONTHLY", new Date("2026-12-31T23:59:59.999Z"));
  assert.equal(dec.start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(dec.end.toISOString(), "2027-01-01T00:00:00.000Z");

  const jan = windows.snapWindowForType("MONTHLY", new Date("2027-01-01T00:00:00.000Z"));
  assert.equal(jan.start.toISOString(), "2027-01-01T00:00:00.000Z");
});

test("snapping is idempotent — re-snapping a window start returns the same window", () => {
  // alignActiveTournamentWindows re-snaps ACTIVE tournaments on every boot; if
  // this were not idempotent it would rewrite windows on each restart.
  for (const type of ["DAILY", "WEEKLY", "MONTHLY"]) {
    const first = windows.snapWindowForType(type, MIDNIGHT);
    const again = windows.snapWindowForType(type, first.start);
    assert.equal(again.start.getTime(), first.start.getTime(), `${type} start drifted`);
    assert.equal(again.end.getTime(), first.end.getTime(), `${type} end drifted`);
  }
});

// ─── the recurring rollover chain ────────────────────────────────────────────

test("chaining snap from a window end yields the next window, never the same one", () => {
  // This is what nextCycleWindow does: snapWindowForType(type, prevEnd). If
  // snapping the previous end returned the previous window, a recurring
  // tournament would respawn the cycle that just finished — forever.
  for (const type of ["DAILY", "WEEKLY", "MONTHLY"]) {
    const current = windows.snapWindowForType(type, new Date("2026-09-17T12:00:00.000Z"));
    const next = windows.snapWindowForType(type, current.end);
    assert.equal(
      next.start.getTime(),
      current.end.getTime(),
      `${type}: next cycle must start exactly where the previous ended`,
    );
    assert.ok(next.end > current.end, `${type}: next cycle must advance`);
  }
});

test("a daily chain advances one day per step with no drift over a month", () => {
  let w = windows.snapWindowForType("DAILY", new Date("2026-09-01T00:00:00.000Z"));
  for (let i = 0; i < 30; i++) w = windows.snapWindowForType("DAILY", w.end);
  assert.equal(w.start.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(w.end.toISOString(), "2026-10-02T00:00:00.000Z");
});

test("snapWindowForActiveTournament never slides an ACTIVE window forward to now", () => {
  // Snapping to `now` at 00:00 would move a just-ended DAILY window onto the new
  // day, so the lifecycle cron would never see endsAt <= now and the finished
  // cycle would never pay out.
  const startsAt = new Date("2026-09-17T00:00:00.000Z");
  const snap = windows.snapWindowForActiveTournament("DAILY", startsAt, null, MIDNIGHT);
  assert.equal(snap.start.toISOString(), "2026-09-17T00:00:00.000Z");
  assert.equal(
    snap.end.toISOString(),
    "2026-09-18T00:00:00.000Z",
    "the window must stay on the day it started, so finalize can still fire",
  );
});

// ─── the shared instant: current semantics ───────────────────────────────────

test("windowContains treats the shared boundary instant as inside BOTH neighbours", () => {
  // Windows tile as [start, end] — inclusive on both ends — while they are
  // generated so that end[N] === start[N+1]. An event stamped exactly
  // 00:00:00.000 therefore satisfies both the closing and the opening window.
  //
  // This test pins CURRENT behaviour, so that changing it is a deliberate act
  // and not an accident. See README, "Fronteira 00:00 UTC".
  const closing = { startsAt: new Date("2026-09-17T00:00:00.000Z"), endsAt: MIDNIGHT };
  const opening = { startsAt: MIDNIGHT, endsAt: new Date("2026-09-19T00:00:00.000Z") };

  assert.equal(types.windowContains(closing, MIDNIGHT), true);
  assert.equal(types.windowContains(opening, MIDNIGHT), true);
});

test("one millisecond either side of the boundary belongs to exactly one window", () => {
  const closing = { startsAt: new Date("2026-09-17T00:00:00.000Z"), endsAt: MIDNIGHT };
  const opening = { startsAt: MIDNIGHT, endsAt: new Date("2026-09-19T00:00:00.000Z") };

  const justBefore = new Date(MIDNIGHT.getTime() - ONE_MS);
  assert.equal(types.windowContains(closing, justBefore), true);
  assert.equal(types.windowContains(opening, justBefore), false);

  const justAfter = new Date(MIDNIGHT.getTime() + ONE_MS);
  assert.equal(types.windowContains(closing, justAfter), false);
  assert.equal(types.windowContains(opening, justAfter), true);
});

test("a live tournament clamps scoring to now, and now is inclusive", () => {
  // upperBound is `now` while the tournament runs and `endsAt` once it has
  // ended. Inclusivity only matters for the endsAt case.
  const w = { startsAt: new Date("2026-09-17T00:00:00.000Z"), endsAt: MIDNIGHT };
  const now = new Date("2026-09-17T12:00:00.000Z");
  assert.equal(types.windowContains(w, now, now), true);
  assert.equal(types.windowContains(w, new Date(now.getTime() + ONE_MS), now), false);
});
