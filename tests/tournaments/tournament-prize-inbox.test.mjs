import assert from "node:assert/strict";
import test from "node:test";

const {
  isPendingTournamentPowerInboxItem,
  shouldQueueTournamentPrizeInInbox,
} = await import("../../server/modules/notifications/reward-inbox.power.ts");

test("tournament MINING_BOOST is not queued in reward inbox", () => {
  assert.equal(shouldQueueTournamentPrizeInInbox("MINING_BOOST"), false);
  assert.equal(shouldQueueTournamentPrizeInInbox("POL"), true);
  assert.equal(shouldQueueTournamentPrizeInInbox("BLK"), true);
  assert.equal(shouldQueueTournamentPrizeInInbox("MACHINE"), true);
});

test("pending tournament power inbox rows are the leftover flush set", () => {
  assert.equal(isPendingTournamentPowerInboxItem("tournament", "hashrate_boost"), true);
  assert.equal(isPendingTournamentPowerInboxItem("tournament", "temporary_power"), true);
  assert.equal(isPendingTournamentPowerInboxItem("tournament", "pol"), false);
  assert.equal(isPendingTournamentPowerInboxItem("checkin_milestone", "temporary_power"), false);
});
