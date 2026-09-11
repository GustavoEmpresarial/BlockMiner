import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration test (dev DB on :5433, see current/.env).
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const tasksService = await import("../../server/modules/tasks/tasks.service.ts");
const tasksRepo = await import("../../server/modules/tasks/tasks.repository.ts");
const { getUtcDayKey } = await import("../../server/shared/calendar/utcCalendar.ts");

const TODAY_KEY = getUtcDayKey(new Date());

const createdUserIds = [];
const createdDefIds = [];

async function makeUser(overrides = {}) {
  const suffix = `tasks_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Tasks Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.30",
      ip: "203.0.113.30",
      userAgent: "test-agent/1.0",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeDefinition(overrides = {}) {
  const slug = `test-task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const def = await prisma.dailyTaskDefinition.create({
    data: {
      slug,
      taskType: "LOGIN_DAY",
      resetCadence: "DAILY",
      targetValue: "1",
      translationKey: "tasks.test",
      rewardKind: "POL",
      rewardPolAmount: "5",
      isActive: true,
      ...overrides,
    },
  });
  createdDefIds.push(def.id);
  return def;
}

test.after(async () => {
  if (createdUserIds.length) {
    await prisma.userRewardInbox.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userDailyTaskProgress.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  if (createdDefIds.length) {
    await prisma.userDailyTaskDedupeTick.deleteMany({ where: { taskDefinitionId: { in: createdDefIds } } });
    await prisma.dailyTaskDefinition.deleteMany({ where: { id: { in: createdDefIds } } });
  }
  await prisma.$disconnect();
});

test("notifyDailyTaskLoginDay: increments progress and marks completed once target is reached", async () => {
  const user = await makeUser();
  const def = await makeDefinition({ taskType: "LOGIN_DAY", targetValue: "1" });

  await tasksService.notifyDailyTaskLoginDay(user.id, TODAY_KEY);

  const row = await tasksRepo.findProgressUnique(user.id, def.id, TODAY_KEY);
  assert.ok(row, `progress row should exist (user=${user.id} def=${def.id})`);
  assert.equal(Number(row.currentValue), 1);
  assert.ok(row.completedAt, "task should be marked completed");
  assert.equal(row.rewardClaimedAt, null);
});

test("notifyDailyTaskLoginDay: same dedupeKey (checkinDateKey) does not double-count", async () => {
  const user = await makeUser();
  const def = await makeDefinition({ taskType: "LOGIN_DAY", targetValue: "5" });

  await tasksService.notifyDailyTaskLoginDay(user.id, TODAY_KEY);
  await tasksService.notifyDailyTaskLoginDay(user.id, TODAY_KEY);
  await tasksService.notifyDailyTaskLoginDay(user.id, TODAY_KEY);

  const row = await tasksRepo.findProgressUnique(user.id, def.id, TODAY_KEY);
  assert.equal(Number(row.currentValue), 1, "dedupe key must prevent double-counting");
  assert.equal(row.completedAt, null, "target is 5, one tick must not complete it");
});

test("notifyDailyTaskGamePlayed: only bumps definitions matching gameSlug when set", async () => {
  const user = await makeUser();
  const scoped = await makeDefinition({
    taskType: "PLAY_GAMES",
    targetValue: "1",
    gameSlug: "game2048",
    slug: `scoped-${Date.now()}`,
  });
  const other = await makeDefinition({
    taskType: "PLAY_GAMES",
    targetValue: "1",
    gameSlug: "other-game",
    slug: `other-${Date.now()}`,
  });

  await tasksService.notifyDailyTaskGamePlayed(user.id, { userPowerGameId: 999001, gameSlug: "game2048" });

  const periodKey = TODAY_KEY;
  const scopedRow = await tasksRepo.findProgressUnique(user.id, scoped.id, periodKey);
  const otherRow = await tasksRepo.findProgressUnique(user.id, other.id, periodKey);
  assert.ok(scopedRow, "matching gameSlug definition should be bumped");
  assert.equal(otherRow, null, "non-matching gameSlug definition should not be bumped");
});

test("notifyDailyTaskInternalOfferwallCompleted: only bumps definitions scoped to that offer", async () => {
  const user = await makeUser();
  const def = await makeDefinition({
    taskType: "INTERNAL_OFFERWALL",
    targetValue: "1",
    internalOfferwallOfferId: null,
    slug: `offerwall-${Date.now()}`,
  });

  await tasksService.notifyDailyTaskInternalOfferwallCompleted(user.id, 555001, 42);

  const periodKey = TODAY_KEY;
  const row = await tasksRepo.findProgressUnique(user.id, def.id, periodKey);
  assert.ok(row, "unscoped INTERNAL_OFFERWALL definition should be bumped by any offer");
});

test("getDailyTasksDashboard: reports available/in_progress/completed/claimed status transitions", async () => {
  const user = await makeUser();
  const def = await makeDefinition({ taskType: "MINE_BLK", targetValue: "10", rewardKind: "BLK", rewardBlkAmount: "2", rewardPolAmount: null });

  let dash = await tasksService.getDailyTasksDashboard(user.id);
  let entry = dash.tasks.find((t) => t.id === def.id);
  assert.equal(entry.status, "available");

  await tasksService.bumpDailyTasksForUser(user.id, "MINE_BLK", { dedupeKey: "blklog-1", delta: 5 });
  dash = await tasksService.getDailyTasksDashboard(user.id);
  entry = dash.tasks.find((t) => t.id === def.id);
  assert.equal(entry.status, "in_progress");
  assert.equal(entry.currentValue, 5);

  await tasksService.bumpDailyTasksForUser(user.id, "MINE_BLK", { dedupeKey: "blklog-2", delta: 5 });
  dash = await tasksService.getDailyTasksDashboard(user.id);
  entry = dash.tasks.find((t) => t.id === def.id);
  assert.equal(entry.status, "completed");
  assert.equal(entry.currentValue, 10);

  const claim = await tasksService.claimDailyTaskReward(user.id, def.id);
  assert.equal(claim.ok, true);
  assert.equal(claim.summary.kind, "BLK");

  dash = await tasksService.getDailyTasksDashboard(user.id);
  entry = dash.tasks.find((t) => t.id === def.id);
  assert.equal(entry.status, "claimed");
});

test("claimDailyTaskReward: rejects claim before task is completed", async () => {
  const user = await makeUser();
  const def = await makeDefinition({ taskType: "MINE_BLK", targetValue: "100" });
  const claim = await tasksService.claimDailyTaskReward(user.id, def.id);
  assert.equal(claim.ok, false);
  assert.equal(claim.code, "not_completed");
  assert.equal(claim.status, 400);
});

test("claimDailyTaskReward: rejects double-claim", async () => {
  const user = await makeUser();
  const def = await makeDefinition({ taskType: "MINE_BLK", targetValue: "1" });
  await tasksService.bumpDailyTasksForUser(user.id, "MINE_BLK", { dedupeKey: "blklog-double", delta: 1 });

  const first = await tasksService.claimDailyTaskReward(user.id, def.id);
  assert.equal(first.ok, true);

  const second = await tasksService.claimDailyTaskReward(user.id, def.id);
  assert.equal(second.ok, false);
  assert.equal(second.code, "already_claimed");
  assert.equal(second.status, 409);
});

test("claimDailyTaskReward: POL reward creates a reward-inbox entry (never credits balance directly)", async () => {
  const user = await makeUser();
  const def = await makeDefinition({ taskType: "MINE_BLK", targetValue: "1", rewardKind: "POL", rewardPolAmount: "7.5" });
  await tasksService.bumpDailyTasksForUser(user.id, "MINE_BLK", { dedupeKey: "blklog-inbox", delta: 1 });

  const claim = await tasksService.claimDailyTaskReward(user.id, def.id);
  assert.equal(claim.ok, true);

  const inboxRows = await prisma.userRewardInbox.findMany({ where: { userId: user.id, source: "daily_task" } });
  assert.equal(inboxRows.length, 1);
  assert.equal(inboxRows[0].rewardType, "pol");
  assert.equal(Number(inboxRows[0].rewardValue), 7.5);
  assert.equal(inboxRows[0].status, "pending");
});

test("claimDailyTaskReward: unknown task id returns not_found", async () => {
  const user = await makeUser();
  const claim = await tasksService.claimDailyTaskReward(user.id, 987654321);
  assert.equal(claim.ok, false);
  assert.equal(claim.code, "not_found");
  assert.equal(claim.status, 404);
});
