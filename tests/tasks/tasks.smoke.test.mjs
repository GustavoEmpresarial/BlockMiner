import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const { default: prisma } = await import("../../server/core/database/prisma.ts");
const tasksService = await import("../../server/modules/tasks/tasks.service.ts");
const tasksRepo = await import("../../server/modules/tasks/tasks.repository.ts");
const { getUtcDayKey } = await import("../../server/shared/calendar/utcCalendar.ts");

test("Tasks End-to-End Smoke Test: Complete mission lifecycle and race-safe concurrent claiming", async (t) => {
  const ts = Date.now();
  const slug = `smoke-task-${ts}`;
  const dayKey = getUtcDayKey(new Date());

  let user = null;
  let def = null;

  try {
    // 1. Create test user
    user = await prisma.user.create({
      data: {
        name: "Smoke Tasks User",
        username: `taskuser_${ts}`.slice(0, 20),
        email: `taskuser_${ts}@blockminer.test`,
        passwordHash: "$2a$10$dummyhashplaceholderforptcsmoke1234567890",
        polBalance: new Prisma.Decimal("0"),
        blkBalance: new Prisma.Decimal("0"),
      },
    });

    // 2. Create mission definition with POL reward
    def = await tasksRepo.createDailyTaskDefinition({
      slug,
      taskType: "LOGIN_DAY",
      resetCadence: "DAILY",
      targetValue: new Prisma.Decimal("1"),
      translationKey: "dailyTasks.login_1",
      rewardKind: "POL",
      rewardPolAmount: new Prisma.Decimal("0.5"),
      isActive: true,
      sortOrder: 1,
    });
    assert.ok(def.id > 0, "Task definition must be created");

    // ── Subtest 1: Player checks dashboard before completion ──────────────────
    await t.test("Dashboard: reports mission as available with 0 progress", async () => {
      const dashboard = await tasksService.getDailyTasksDashboard(user.id);
      assert.equal(dashboard.ok !== false, true);
      const mission = dashboard.tasks.find((tk) => tk.id === def.id);
      assert.ok(mission, "Mission must appear in dashboard");
      assert.equal(mission.status, "available");
      assert.equal(mission.currentValue, 0);
      assert.equal(mission.targetValue, 1);
    });

    // ── Subtest 2: Advance progress to completion ──────────────────────────────
    await t.test("Progress Hook: advances progress and transitions mission to completed", async () => {
      await tasksService.notifyDailyTaskLoginDay(user.id, dayKey);

      const dashboard = await tasksService.getDailyTasksDashboard(user.id);
      const mission = dashboard.tasks.find((tk) => tk.id === def.id);
      assert.ok(mission);
      assert.equal(mission.status, "completed");
      assert.equal(mission.currentValue, 1);
    });

    // ── Subtest 3: Concurrent Race-Condition Claim Test ────────────────────────
    await t.test("Race-Condition Safety: 10 simultaneous claims result in exactly 1 success and 9 rejections", async () => {
      // Dispatch 10 parallel claims concurrently
      const attempts = Array.from({ length: 10 }, () =>
        tasksService.claimDailyTaskReward(user.id, def.id),
      );

      const results = await Promise.all(attempts);

      const successfulClaims = results.filter((r) => r.ok === true);
      const rejectedClaims = results.filter((r) => r.ok === false);

      assert.equal(successfulClaims.length, 1, "Exactly one claim must succeed");
      assert.equal(rejectedClaims.length, 9, "Exactly 9 claims must be rejected");

      for (const rej of rejectedClaims) {
        assert.equal(rej.code, "already_claimed");
        assert.equal(rej.status, 409);
      }

      // Check reward inbox
      const inboxEntry = await prisma.userRewardInbox.findFirst({
        where: {
          userId: user.id,
          source: "daily_task",
          rewardType: "pol",
        },
      });
      assert.ok(inboxEntry, "Reward inbox entry must be created");
      assert.equal(Number(inboxEntry.rewardValue), 0.5);

      // Verify dashboard shows 'claimed'
      const dashboard = await tasksService.getDailyTasksDashboard(user.id);
      const mission = dashboard.tasks.find((tk) => tk.id === def.id);
      assert.equal(mission.status, "claimed");
    });
  } finally {
    // Cleanup
    if (def?.id) {
      await prisma.userDailyTaskDedupeTick.deleteMany({ where: { taskDefinitionId: def.id } });
      await prisma.userDailyTaskProgress.deleteMany({ where: { taskDefinitionId: def.id } });
      await prisma.dailyTaskDefinition.delete({ where: { id: def.id } }).catch(() => {});
    }
    if (user?.id) {
      await prisma.userRewardInbox.deleteMany({ where: { userId: user.id } });
      await prisma.auditLog.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
  }
});
