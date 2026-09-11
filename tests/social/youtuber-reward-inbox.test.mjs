/**
 * Contract tests: youtuber partnership machines queue into reward inbox
 * (not direct inventory). No DB required.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const {
  shouldQueueTournamentPrizeInInbox,
} = await import("../../server/modules/notifications/reward-inbox.power.ts");

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const socialServiceSrc = readFileSync(join(root, "server/modules/social/social.service.ts"), "utf8");
const rewardInboxServiceSrc = readFileSync(
  join(root, "server/modules/notifications/reward-inbox.service.ts"),
  "utf8",
);

test("tournament MACHINE prizes are queued in reward inbox policy", () => {
  assert.equal(shouldQueueTournamentPrizeInInbox("MACHINE"), true);
  assert.equal(shouldQueueTournamentPrizeInInbox("POL"), true);
  assert.equal(shouldQueueTournamentPrizeInInbox("MINING_BOOST"), false);
});

test("approveSubmission queues youtuber_reward machine via createRewardInboxEntry", () => {
  assert.match(socialServiceSrc, /createRewardInboxEntry/);
  assert.match(socialServiceSrc, /source:\s*"youtuber_reward"/);
  assert.match(socialServiceSrc, /rewardType:\s*"machine"/);
  // Must not grant inventory directly on approve (collect path does that).
  assert.equal(socialServiceSrc.includes("grantPurchasedInventoryItems("), false);
});

test("reward-inbox maps youtuber_reward earnings source to youtube", () => {
  assert.match(rewardInboxServiceSrc, /youtuber_reward/);
  assert.match(
    rewardInboxServiceSrc,
    /s === "youtube" \|\| s === "youtuber_reward"\) return "youtube"/,
  );
});
