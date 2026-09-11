import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPendingTournamentPowerInboxItem,
  isTemporaryPowerRewardType,
  resolvePowerBoostGame,
  shouldQueueTournamentPrizeInInbox,
} from "../../dist/server/modules/notifications/reward-inbox.power.js";

describe("reward-inbox power routing", () => {
  it("treats hashrate_boost as temporary power", () => {
    assert.equal(isTemporaryPowerRewardType("hashrate_boost"), true);
    assert.equal(isTemporaryPowerRewardType("temporary_power"), true);
    assert.equal(isTemporaryPowerRewardType("machine"), false);
  });

  it("keeps tournament mining boost out of the reward inbox", () => {
    assert.equal(shouldQueueTournamentPrizeInInbox("MINING_BOOST"), false);
    assert.equal(shouldQueueTournamentPrizeInInbox("POL"), true);
    assert.equal(shouldQueueTournamentPrizeInInbox("BLK"), true);
    assert.equal(shouldQueueTournamentPrizeInInbox("MACHINE"), true);
    assert.equal(isPendingTournamentPowerInboxItem("tournament", "hashrate_boost"), true);
    assert.equal(isPendingTournamentPowerInboxItem("tournament", "pol"), false);
    assert.equal(isPendingTournamentPowerInboxItem("checkin_milestone", "temporary_power"), false);
  });

  it("maps tournament boosts to tournament game slug", () => {
    assert.deepEqual(resolvePowerBoostGame("hashrate_boost", "tournament"), {
      slug: "tournament-mining-boost",
      name: "Tournament mining boost",
    });
    assert.deepEqual(resolvePowerBoostGame("temporary_power", "checkin_milestone"), {
      slug: "checkin-streak-bonus",
      name: "Check-in streak bonus",
    });
  });
});
