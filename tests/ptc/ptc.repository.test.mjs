import test from "node:test";
import assert from "node:assert/strict";

const repo = await import("../../server/modules/ptc/ptc.repository.ts");

test("ptc.repository exports the expected functions", () => {
  for (const name of [
    "wasViewedOnUtcDay",
    "findViewBlockedForToday",
    "findViewBlockedForTodayTx",
    "getSettings",
    "updateSettings",
    "getTiers",
    "getActiveTiers",
    "getTierById",
    "createTier",
    "updateTier",
    "deleteTier",
    "getCampaignById",
    "getCampaignsByUser",
    "updateCampaign",
    "getPendingCampaigns",
    "getAllCampaignsAdmin",
    "recordView",
    "getAdsForViewer",
    "getUserEarnings",
    "createSession",
    "getSessionById",
    "listOpenSessionsForUser",
    "getActiveSessionForUser",
    "updateSession",
  ]) {
    assert.equal(typeof repo[name], "function", `expected ${name} to be exported`);
  }
});

test("wasViewedOnUtcDay: true when lastViewedUtcDate is today (UTC), dedup key is UTC calendar day not BRT", () => {
  const now = new Date("2026-08-08T23:30:00.000Z"); // 20:30 BRT the same UTC day
  const lastViewedUtcDate = new Date("2026-08-08T00:00:00.000Z");
  assert.equal(repo.wasViewedOnUtcDay(lastViewedUtcDate, null, now), true);
});

test("wasViewedOnUtcDay: false once UTC day has rolled over, even if BRT day has not", () => {
  // 2026-08-08T23:30 UTC is still 2026-08-08 20:30 BRT; but 2026-08-09T02:00 UTC is
  // 2026-08-08 23:00 BRT — UTC day already rolled, BRT day has not. Dedup must follow UTC.
  const now = new Date("2026-08-09T02:00:00.000Z");
  const lastViewedUtcDate = new Date("2026-08-08T00:00:00.000Z");
  assert.equal(repo.wasViewedOnUtcDay(lastViewedUtcDate, null, now), false);
});

test("wasViewedOnUtcDay: falls back to viewedAt when lastViewedUtcDate is missing", () => {
  const now = new Date("2026-08-08T12:00:00.000Z");
  const viewedAt = new Date("2026-08-08T05:00:00.000Z");
  assert.equal(repo.wasViewedOnUtcDay(null, viewedAt, now), true);
});

test("wasViewedOnUtcDay: false when there is no prior view data at all", () => {
  assert.equal(repo.wasViewedOnUtcDay(null, null, new Date()), false);
});
