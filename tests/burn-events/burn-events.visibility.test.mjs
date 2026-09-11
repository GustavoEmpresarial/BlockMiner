import test from "node:test";
import assert from "node:assert/strict";

const {
  isEventCurrentlyOpen,
  isEventVisibleOnHub,
} = await import("../../server/modules/burn-events/burn-events.helpers.ts");

const base = {
  isActive: true,
  deletedAt: null,
  startsAt: new Date("2026-09-15T00:00:00.000Z"),
  endsAt: new Date("2026-10-31T23:59:59.999Z"),
  stockTotal: 10,
  stockClaimed: 0,
};

test("upcoming event is visible on hub but not open for claim", () => {
  const now = new Date("2026-09-01T03:00:00.000Z");
  assert.equal(isEventVisibleOnHub(base, now), true);
  assert.equal(isEventCurrentlyOpen(base, now), false);
});

test("event is open inside the window", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");
  assert.equal(isEventVisibleOnHub(base, now), true);
  assert.equal(isEventCurrentlyOpen(base, now), true);
});

test("event disappears after endsAt", () => {
  const now = new Date("2026-11-01T00:00:00.000Z");
  assert.equal(isEventVisibleOnHub(base, now), false);
  assert.equal(isEventCurrentlyOpen(base, now), false);
});
