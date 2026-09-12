import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toCumulativeHistory } from "../../server/modules/stats/stats.earnings.service.ts";

function point(date, overrides = {}) {
  return {
    date,
    total: 0,
    mining: 0,
    offerwall: 0,
    offerwallInternal: 0,
    offerwallExternal: 0,
    faucet: 0,
    shortlinks: 0,
    youtube: 0,
    games: 0,
    autoMining: 0,
    checkin: 0,
    referrals: 0,
    ...overrides,
  };
}

describe("toCumulativeHistory", () => {
  it("returns a running cumulative total, not the per-day value", () => {
    const out = toCumulativeHistory([
      point("2026-03-01", { mining: 5, total: 5 }),
      point("2026-03-02", { mining: 3, total: 3 }),
    ]);
    assert.equal(out[0].total, 5);
    assert.equal(out[1].total, 8, "day 2 must be 5 (day1) + 3 (day2), not just day2's own 3");
    assert.equal(out[1].mining, 8);
  });

  it("sorts by date ascending before accumulating, regardless of input order", () => {
    const out = toCumulativeHistory([
      point("2026-03-02", { total: 3 }),
      point("2026-03-01", { total: 5 }),
    ]);
    assert.deepEqual(out.map((p) => p.date), ["2026-03-01", "2026-03-02"]);
    assert.equal(out[1].total, 8);
  });

  it("accumulates every earnings category independently, matching the summed total", () => {
    const out = toCumulativeHistory([
      point("2026-03-01", { mining: 2, offerwall: 1, total: 3 }),
      point("2026-03-02", { mining: 1, offerwall: 4, total: 5 }),
    ]);
    assert.equal(out[1].mining, 3);
    assert.equal(out[1].offerwall, 5);
    assert.equal(out[1].total, 8);
  });

  it("returns an empty array for empty input", () => {
    assert.deepEqual(toCumulativeHistory([]), []);
  });
});
