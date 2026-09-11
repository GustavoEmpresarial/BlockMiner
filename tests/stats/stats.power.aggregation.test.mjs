import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateUserHashrates, CHECKIN_BONUS_GAME_SLUG } from "../../server/modules/tournaments/index.ts";

// GET /api/stats/power reuses tournaments' aggregateUserHashrates (via tournaments/index.ts) for
// the overview/machines/games/youtube/autoMining hashrate breakdown — exercise the math the
// same way stats.controller.ts does.

describe("stats power breakdown (aggregateUserHashrates reuse)", () => {
  it("splits permanent (machines) vs temporary (games/youtube/gpu) hashrate", () => {
    const agg = aggregateUserHashrates(
      {
        id: 1,
        miners: [{ hashRate: 100, isActive: true }, { hashRate: 50, isActive: false }],
        gamePowers: [
          { hashRate: 10, game: { slug: "some-minigame" } },
          { hashRate: 5, game: { slug: CHECKIN_BONUS_GAME_SLUG } },
        ],
        ytPowers: [{ hashRate: 3 }],
        gpuAccess: [{ gpuHashRate: 2 }],
        autoMiningV2Grants: [{ hashRate: 1 }],
      },
      { onlyActiveMiners: true },
    );

    assert.equal(agg.permanentHashrate, 100, "inactive miner excluded");
    assert.equal(agg.temporaryMinigameHashrate, 10);
    assert.equal(agg.temporaryCheckinHashrate, 5);
    assert.equal(agg.temporaryYoutubeHashrate, 3);
    assert.equal(agg.temporaryAutoMiningHashrate, 3, "legacy gpu + v2 grant summed");
    assert.equal(agg.temporaryHashrate, 10 + 5 + 3 + 3);
    assert.equal(agg.totalHashrate, 100 + 21);
  });

  it("includes inactive miners when onlyActiveMiners is false", () => {
    const agg = aggregateUserHashrates(
      { id: 1, miners: [{ hashRate: 100, isActive: true }, { hashRate: 50, isActive: false }] },
      { onlyActiveMiners: false },
    );
    assert.equal(agg.permanentHashrate, 150);
  });

  it("handles an empty/new user with zero hashrate everywhere", () => {
    const agg = aggregateUserHashrates({ id: 1 }, { onlyActiveMiners: true });
    assert.equal(agg.totalHashrate, 0);
    assert.equal(agg.permanentHashrate, 0);
    assert.equal(agg.temporaryHashrate, 0);
  });
});
