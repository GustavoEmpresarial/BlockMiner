import test from "node:test";
import assert from "node:assert/strict";

// Real Postgres integration test (dev DB on :5433, see current/.env) — exercises the four
// notifyDailyTask* hooks by calling the REAL owning-module flows (youtube claim, checkin
// side-effects), not the tasks module directly, to prove the wiring in
// checkin.notifications.ts / youtube.service.ts / internal-offerwall.service.ts /
// game2048.service.ts actually fires (Fase 10d — see PROGRESSO.txt entry 10d).
const { default: prisma } = await import("../../server/core/database/prisma.ts");
const { getUtcDayKey } = await import("../../server/shared/calendar/utcCalendar.ts");
const youtubeService = await import("../../server/modules/youtube/youtube.service.ts");
const youtubeRepo = await import("../../server/modules/youtube/youtube.repository.ts");
const { fireCheckinSideEffects } = await import("../../server/modules/checkin/checkin.notifications.ts");
const tasksRepo = await import("../../server/modules/tasks/tasks.repository.ts");

const TODAY_KEY = getUtcDayKey(new Date());
const createdUserIds = [];
const createdDefIds = [];

async function makeUser(overrides = {}) {
  const suffix = `taskhook_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      name: "Task Hook Test",
      username: suffix,
      email: `${suffix}@blockminer.test`,
      passwordHash: "x",
      registrationIp: "203.0.113.40",
      ip: "203.0.113.40",
      userAgent: "test-agent/1.0",
      ...overrides,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function makeDefinition(overrides = {}) {
  const slug = `hook-task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const def = await prisma.dailyTaskDefinition.create({
    data: {
      slug,
      taskType: "LOGIN_DAY",
      resetCadence: "DAILY",
      targetValue: "1",
      translationKey: "tasks.test",
      rewardKind: "POL",
      rewardPolAmount: "1",
      isActive: true,
      ...overrides,
    },
  });
  createdDefIds.push(def.id);
  return def;
}

test.after(async () => {
  if (createdUserIds.length) {
    await prisma.youtubeWatchHistory.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.youtubeWatchPower.deleteMany({ where: { userId: { in: createdUserIds } } });
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

test("hook wiring: a real YouTube claim advances the WATCH_YOUTUBE daily task progress", async () => {
  const user = await makeUser({ ytSecondsBalance: youtubeRepo.MIN_SECONDS_TO_CLAIM + 5 });
  const def = await makeDefinition({ taskType: "WATCH_YOUTUBE", targetValue: "1", slug: `yt-${Date.now()}` });

  const result = await youtubeService.claimForUser(user.id, "vid-daily-task-hook");
  assert.equal(result.ok, true);

  const row = await tasksRepo.findProgressUnique(user.id, def.id, TODAY_KEY);
  assert.ok(row, "youtube claim must have bumped the WATCH_YOUTUBE daily task");
  assert.equal(Number(row.currentValue), 1);
  assert.ok(row.completedAt, "target is 1, a single claim should complete the task");
});

test("hook wiring: fireCheckinSideEffects (checkin flow) advances the LOGIN_DAY daily task progress", async () => {
  const user = await makeUser();
  const def = await makeDefinition({ taskType: "LOGIN_DAY", targetValue: "1", slug: `login-${Date.now()}` });

  await fireCheckinSideEffects(user.id, TODAY_KEY);

  const row = await tasksRepo.findProgressUnique(user.id, def.id, TODAY_KEY);
  assert.ok(row, "checkin side-effects must have bumped the LOGIN_DAY daily task");
  assert.equal(Number(row.currentValue), 1);
  assert.ok(row.completedAt);
});
