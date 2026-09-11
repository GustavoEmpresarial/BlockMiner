import test from "node:test";
import assert from "node:assert/strict";

const {
  normalizeMilestoneRewardType,
  isAllowedMilestoneRewardType,
  isInvalidLegacyMilestoneRewardType,
  readDurationHours,
  parseMilestoneBody,
  REWARD_POL,
  REWARD_TEMPORARY_POWER,
  REWARD_MACHINE,
} = await import("../../server/modules/checkin/checkin.milestones.ts");

test("normalizeMilestoneRewardType — maps legacy aliases", () => {
  assert.equal(normalizeMilestoneRewardType("balance"), REWARD_POL);
  assert.equal(normalizeMilestoneRewardType("hashrate"), REWARD_TEMPORARY_POWER);
  assert.equal(normalizeMilestoneRewardType("zer"), "stelar");
  assert.equal(normalizeMilestoneRewardType("pol"), REWARD_POL);
});

test("isAllowedMilestoneRewardType — only pol/temporary_power/machine allowed", () => {
  assert.equal(isAllowedMilestoneRewardType("pol"), true);
  assert.equal(isAllowedMilestoneRewardType("temporary_power"), true);
  assert.equal(isAllowedMilestoneRewardType("machine"), true);
  assert.equal(isAllowedMilestoneRewardType("stelar"), false);
  assert.equal(isAllowedMilestoneRewardType("item"), false);
});

test("isInvalidLegacyMilestoneRewardType — flags disallowed raw types, allows aliases", () => {
  assert.equal(isInvalidLegacyMilestoneRewardType("item"), true);
  assert.equal(isInvalidLegacyMilestoneRewardType("ticket"), true);
  assert.equal(isInvalidLegacyMilestoneRewardType("hashrate"), false);
  assert.equal(isInvalidLegacyMilestoneRewardType("balance"), false);
  assert.equal(isInvalidLegacyMilestoneRewardType("pol"), false);
});

test("readDurationHours — reads metadataJson.durationHours when present and positive", () => {
  assert.equal(readDurationHours(1, { durationHours: 48 }), 48);
});

test("readDurationHours — falls back to validityDays * 24", () => {
  assert.equal(readDurationHours(3, null), 72);
  assert.equal(readDurationHours(0, null), 24); // min 1 day
});

test("readDurationHours — caps at 24*365", () => {
  assert.equal(readDurationHours(1, { durationHours: 999999 }), 24 * 365);
});

test("parseMilestoneBody — POL milestone requires positive rewardValue, no minerId", () => {
  const parsed = parseMilestoneBody({ dayThreshold: 7, rewardType: "pol", rewardValue: 5 });
  assert.equal(parsed.dayThreshold, 7);
  assert.equal(parsed.rewardType, REWARD_POL);
  assert.equal(Number(parsed.rewardValue), 5);
  assert.equal(parsed.minerId, null);

  assert.throws(() => parseMilestoneBody({ dayThreshold: 7, rewardType: "pol", rewardValue: 0 }), /rewardValue > 0/);
  assert.throws(
    () => parseMilestoneBody({ dayThreshold: 7, rewardType: "pol", rewardValue: 5, minerId: 1 }),
    /cannot include minerId/,
  );
});

test("parseMilestoneBody — temporary_power derives validityDays from durationHours", () => {
  const parsed = parseMilestoneBody({ dayThreshold: 14, rewardType: "temporary_power", rewardValue: 100, durationHours: 50 });
  assert.equal(parsed.rewardType, REWARD_TEMPORARY_POWER);
  assert.equal(parsed.validityDays, Math.ceil(50 / 24));
});

test("parseMilestoneBody — machine milestone requires minerId", () => {
  assert.throws(() => parseMilestoneBody({ dayThreshold: 30, rewardType: "machine", rewardValue: 0 }), /requires minerId/);
  const parsed = parseMilestoneBody({ dayThreshold: 30, rewardType: "machine", minerId: 42 });
  assert.equal(parsed.rewardType, REWARD_MACHINE);
  assert.equal(parsed.minerId, 42);
});

test("parseMilestoneBody — rejects invalid dayThreshold and itemCode", () => {
  assert.throws(() => parseMilestoneBody({ dayThreshold: 0, rewardType: "pol", rewardValue: 1 }), /dayThreshold/);
  assert.throws(
    () => parseMilestoneBody({ dayThreshold: 1, rewardType: "pol", rewardValue: 1, itemCode: "SOMETHING" }),
    /itemCode is not allowed/,
  );
});

test("parseMilestoneBody — active defaults true, sortOrder defaults 0", () => {
  const parsed = parseMilestoneBody({ dayThreshold: 1, rewardType: "pol", rewardValue: 1 });
  assert.equal(parsed.active, true);
  assert.equal(parsed.sortOrder, 0);
});
