import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEarningsPeriod } from "../../server/modules/stats/stats.earnings.service.ts";

describe("parseEarningsPeriod", () => {
  it("accepts the four known periods", () => {
    assert.equal(parseEarningsPeriod("7d"), "7d");
    assert.equal(parseEarningsPeriod("30d"), "30d");
    assert.equal(parseEarningsPeriod("90d"), "90d");
    assert.equal(parseEarningsPeriod("all"), "all");
  });

  it("is case-insensitive and trims whitespace", () => {
    assert.equal(parseEarningsPeriod(" 7D "), "7d");
    assert.equal(parseEarningsPeriod("ALL"), "all");
  });

  it("defaults to 30d for unknown/empty/missing input", () => {
    assert.equal(parseEarningsPeriod(undefined), "30d");
    assert.equal(parseEarningsPeriod(null), "30d");
    assert.equal(parseEarningsPeriod(""), "30d");
    assert.equal(parseEarningsPeriod("bogus"), "30d");
    assert.equal(parseEarningsPeriod(["bogus"]), "30d");
  });
});
