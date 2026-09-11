import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration test (dev DB on :5433, see current/.env).
// Covers: applyStreakMilestoneRewards actually delivers POL / temporary_power / machine
// milestone rewards via the reward-inbox (createRewardInboxEntry), instead of just logging.
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { applyStreakMilestoneRewards } = await import("../../server/modules/checkin/checkin.milestones.ts");
const { getUtcDayKey, addDaysToUtcDayKey } = await import("../../server/shared/calendar/utcCalendar.ts");

const createdUserIds = [];
const createdMilestoneIds = [];

async function makeUser() {
  const suffix = `chkms_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Checkin Milestone Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.31",
      ip: "203.0.113.31",
      userAgent: "test-agent/1.0",
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeConfirmedCheckin(userId, dayKey, i) {
  await prisma.dailyCheckin.create({
    data: {
      userId,
      checkinDate: dayKey,
      status: "confirmed",
      confirmedAt: new Date(),
      txHash: `test-milestone-${userId}-${i}-${Math.random().toString(36).slice(2)}`,
      chainId: 137,
    },
  });
}

async function makeMilestone(data) {
  const m = await prisma.checkinStreakMilestone.create({
    data: {
      dayThreshold: data.dayThreshold,
      rewardType: data.rewardType,
      rewardValue: data.rewardValue ?? 0,
      validityDays: data.validityDays ?? 1,
      active: true,
      sortOrder: 0,
      minerId: data.minerId ?? null,
      metadataJson: data.metadataJson,
    },
  });
  createdMilestoneIds.push(m.id);
  return m;
}

test.after(async () => {
  if (createdUserIds.length) {
    await prisma.userRewardInbox.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userCheckinStreakReward.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.dailyCheckin.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  if (createdMilestoneIds.length) {
    await prisma.checkinStreakMilestone.deleteMany({ where: { id: { in: createdMilestoneIds } } });
  }
  await prisma.$disconnect();
});

test("applyStreakMilestoneRewards: POL milestone credits a real reward-inbox entry", async () => {
  const user = await makeUser();
  const today = getUtcDayKey(new Date());
  await makeConfirmedCheckin(user.id, today, 1);
  const milestone = await makeMilestone({ dayThreshold: 1, rewardType: "pol", rewardValue: 12.5 });

  const before = await prisma.userRewardInbox.findMany({ where: { userId: user.id, source: "checkin_milestone" } });
  assert.equal(before.length, 0);

  const result = await applyStreakMilestoneRewards(user.id);
  const grant = result.granted.find((g) => g.milestoneId === milestone.id);
  assert.ok(grant, "this milestone must be in the granted list");

  const after = await prisma.userRewardInbox.findMany({
    where: { userId: user.id, source: "checkin_milestone", rewardType: "pol" },
  });
  assert.equal(after.length, 1, "a real reward-inbox row must be created, not just logged");
  assert.equal(after[0].rewardType, "pol");
  assert.equal(Number(after[0].rewardValue), 12.5);
  assert.equal(after[0].status, "pending");

  const claim = await prisma.userCheckinStreakReward.findUnique({
    where: { userId_milestoneId: { userId: user.id, milestoneId: milestone.id } },
  });
  assert.ok(claim, "milestone claim row must exist (idempotency guard)");
});

test("applyStreakMilestoneRewards: temporary_power milestone credits reward-inbox with durationHours", async () => {
  const user = await makeUser();
  const today = getUtcDayKey(new Date());
  const yesterday = addDaysToUtcDayKey(today, -1);
  await makeConfirmedCheckin(user.id, yesterday, 1);
  await makeConfirmedCheckin(user.id, today, 2);
  const milestone = await makeMilestone({
    dayThreshold: 2,
    rewardType: "temporary_power",
    rewardValue: 500,
    validityDays: 3,
    metadataJson: { durationHours: 72 },
  });

  const result = await applyStreakMilestoneRewards(user.id);
  const grant = result.granted.find((g) => g.milestoneId === milestone.id);
  assert.ok(grant, "this milestone must be in the granted list");
  assert.equal(grant.rewardType, "temporary_power");

  const rows = await prisma.userRewardInbox.findMany({
    where: { userId: user.id, source: "checkin_milestone", rewardType: "temporary_power" },
  });
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].rewardValue), 500);
  assert.equal(rows[0].durationHours, 72);
});

test("applyStreakMilestoneRewards: machine milestone credits reward-inbox with miner details", async () => {
  const user = await makeUser();
  const today = getUtcDayKey(new Date());
  await makeConfirmedCheckin(user.id, addDaysToUtcDayKey(today, -2), 1);
  await makeConfirmedCheckin(user.id, addDaysToUtcDayKey(today, -1), 2);
  await makeConfirmedCheckin(user.id, today, 3);

  const miner = await prisma.miner.findFirst({ where: { isActive: true, isArchived: false } });
  assert.ok(miner, "an active catalog miner must exist for this test to be meaningful");

  const milestone = await makeMilestone({ dayThreshold: 3, rewardType: "machine", minerId: miner.id });

  const result = await applyStreakMilestoneRewards(user.id);
  const grant = result.granted.find((g) => g.milestoneId === milestone.id);
  assert.ok(grant, "this milestone must be in the granted list");
  assert.equal(grant.rewardType, "machine");

  const rows = await prisma.userRewardInbox.findMany({
    where: { userId: user.id, source: "checkin_milestone", rewardType: "machine" },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].minerId, miner.id);
  assert.equal(rows[0].minerName, miner.name);
});

test("applyStreakMilestoneRewards: re-running does not double-grant (idempotent)", async () => {
  const user = await makeUser();
  const today = getUtcDayKey(new Date());
  await makeConfirmedCheckin(user.id, today, 1);
  const milestone = await makeMilestone({ dayThreshold: 4, rewardType: "pol", rewardValue: 3 });

  const first = await applyStreakMilestoneRewards(user.id);
  assert.ok(
    first.granted.find((g) => g.milestoneId === milestone.id) === undefined,
    "streak of 1 must not satisfy a dayThreshold-4 milestone",
  );

  // Bump streak up to 4 so the milestone actually becomes eligible.
  await makeConfirmedCheckin(user.id, addDaysToUtcDayKey(today, -1), 2);
  await makeConfirmedCheckin(user.id, addDaysToUtcDayKey(today, -2), 3);
  await makeConfirmedCheckin(user.id, addDaysToUtcDayKey(today, -3), 4);

  const second = await applyStreakMilestoneRewards(user.id);
  const grant = second.granted.find((g) => g.milestoneId === milestone.id);
  assert.ok(grant, "milestone must now be granted once streak reaches its threshold");

  const third = await applyStreakMilestoneRewards(user.id);
  assert.equal(
    third.granted.find((g) => g.milestoneId === milestone.id),
    undefined,
    "already-claimed milestone must not grant again",
  );

  const claimRows = await prisma.userCheckinStreakReward.findMany({
    where: { userId: user.id, milestoneId: milestone.id },
  });
  assert.equal(claimRows.length, 1, "claim row for this milestone must exist exactly once, not twice");
});
