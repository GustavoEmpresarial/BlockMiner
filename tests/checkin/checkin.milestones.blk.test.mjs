/**
 * Check-in milestones can pay BLK (e.g. day 220 = 15 BLK). Like POL, it goes to the reward inbox
 * (the user collects it there) and a milestone is granted once per user.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const spec = (p) => pathToFileURL(path.join(root, p)).href;

const inbox = [];
const claims = [];
const milestones = [{ id: 12, dayThreshold: 220, rewardType: "blk", rewardValue: 15, validityDays: 1, minerId: null, itemCode: null, metadataJson: null, active: true, sortOrder: 0 }];
let streak = 231;

const tx = {
  userCheckinStreakReward: {
    create: async ({ data }) => {
      if (claims.some((c) => c.userId === data.userId && c.milestoneId === data.milestoneId)) {
        const { Prisma } = await import("@prisma/client");
        throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });
      }
      claims.push(data);
      return data;
    },
  },
};
mock.module(spec("server/core/database/prisma.ts"), {
  defaultExport: {
    checkinStreakMilestone: { findMany: async () => milestones },
    userCheckinStreakReward: { findMany: async ({ where }) => claims.filter((c) => c.userId === where.userId) },
    $transaction: async (fn) => fn(tx),
  },
});
mock.module(spec("server/modules/notifications/index.ts"), {
  namedExports: { createRewardInboxEntry: async (_tx, entry) => inbox.push(entry) },
});
mock.module(spec("server/modules/checkin/checkin.streak.ts"), { namedExports: { computeCheckinStreak: async () => streak } });

const m = await import("../../server/modules/checkin/checkin.milestones.ts");

test("blk is an allowed milestone reward type", () => {
  assert.equal(m.REWARD_BLK, "blk");
  assert.equal(m.isAllowedMilestoneRewardType("blk"), true);
  assert.equal(m.isInvalidLegacyMilestoneRewardType("blk"), false);
});

test("parseMilestoneBody: BLK needs a positive amount and no miner", () => {
  const ok = m.parseMilestoneBody({ dayThreshold: 220, rewardType: "blk", rewardValue: 15 });
  assert.equal(ok.rewardType, "blk");
  assert.equal(ok.rewardValue.toString(), "15");
  assert.throws(() => m.parseMilestoneBody({ dayThreshold: 220, rewardType: "blk", rewardValue: 0 }), /BLK milestone requires rewardValue > 0/);
  assert.throws(() => m.parseMilestoneBody({ dayThreshold: 220, rewardType: "blk", rewardValue: 15, minerId: 3 }), /BLK milestone cannot include minerId/);
});

test("a user past day 220 gets 15 BLK in the reward inbox, exactly once", async () => {
  const first = await m.applyStreakMilestoneRewards(363);
  assert.deepEqual(first.granted, [{ milestoneId: 12, dayThreshold: 220, rewardType: "blk", rewardValue: 15 }]);
  assert.deepEqual(inbox, [{ userId: 363, source: "checkin_milestone", rewardType: "blk", rewardValue: 15 }]);
  const again = await m.applyStreakMilestoneRewards(363);
  assert.deepEqual(again.granted, []);
  assert.equal(inbox.length, 1);
});

test("below the threshold nothing is granted", async () => {
  streak = 219;
  const r = await m.applyStreakMilestoneRewards(500);
  assert.deepEqual(r.granted, []);
  assert.equal(inbox.length, 1);
});
