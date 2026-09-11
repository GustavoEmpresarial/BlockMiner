import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EARNINGS_STATS_PAYLOAD_KEYS,
  parseEarningsPeriod,
  rollupEarningsTotalsFromSourceMap,
} from "../../server/modules/stats/stats.earnings.pure.ts";

describe("rollupEarningsTotalsFromSourceMap", () => {
  it("sums offerwall sides and computes total", () => {
    const totals = rollupEarningsTotalsFromSourceMap({
      mining: 10,
      checkin: 2.5,
      offerwallInternal: 1,
      offerwallExternal: 3,
      faucet: 0.1,
      referrals: 0.4,
    });
    assert.equal(totals.offerwall, 4);
    assert.equal(totals.mining, 10);
    assert.equal(totals.checkin, 2.5);
    assert.equal(totals.shortlinks, 0);
    assert.equal(totals.total, 10 + 4 + 0.1 + 2.5 + 0.4);
  });

  it("treats missing sources as zero", () => {
    const totals = rollupEarningsTotalsFromSourceMap({});
    assert.equal(totals.total, 0);
    assert.equal(totals.mining, 0);
  });
});

describe("EARNINGS_STATS_PAYLOAD_KEYS", () => {
  it("keeps stable /stats/earnings shape keys", () => {
    const required = [
      "total",
      "mining",
      "offerwall",
      "offerwallInternal",
      "offerwallExternal",
      "faucet",
      "shortlinks",
      "youtube",
      "games",
      "autoMining",
      "checkin",
      "referrals",
      "referralStatsSince",
      "period",
      "history",
      "powerMeta",
    ];
    for (const key of required) {
      assert.ok(EARNINGS_STATS_PAYLOAD_KEYS.includes(key), `missing key ${key}`);
    }
  });
});

describe("parseEarningsPeriod", () => {
  it("accepts known periods and defaults to 30d", () => {
    assert.equal(parseEarningsPeriod("7d"), "7d");
    assert.equal(parseEarningsPeriod("30d"), "30d");
    assert.equal(parseEarningsPeriod("90d"), "90d");
    assert.equal(parseEarningsPeriod("all"), "all");
    assert.equal(parseEarningsPeriod("bogus"), "30d");
    assert.equal(parseEarningsPeriod(undefined), "30d");
  });
});
