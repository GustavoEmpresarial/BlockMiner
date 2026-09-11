/**
 * Ported from legacy/server/services/dailyTasks/{dailyTaskProgressService,
 * dailyTaskDashboardService,dailyTaskClaimService,dailyTaskHookService}.ts, folded flat per
 * doctrine (module root, no services/ subtree).
 *
 * Reward crediting on claim goes through notifications/index.ts's `createRewardInboxEntry`
 * (the reward-inbox module, already ported in current/ — same mechanism checkin/faucet/etc.
 * are meant to use once they adopt it too). This module never mutates wallet balances directly;
 * the user later "collects" the inbox entry via reward-inbox's own claim flow, which is what
 * actually credits wallet/inventory/boosts through their own public APIs.
 *
 * Deviation (documented): legacy also calls `notifyTournamentScoreIncrement(userId,
 * "TASKS_COMPLETED", 1)` when a task definition just completed. current/'s tournaments/index.ts
 * only exposes `recordTournamentAction` (provider-based action recording), not a generic score-
 * increment hook — same shape mismatch already documented in other Fase 7+ ports. Not wired here;
 * left as a follow-up for whoever extends tournaments/ with a generic score hook.
 */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { createRewardInboxEntry, type InboxRewardPayload } from "../notifications/index.js";
import { isSidebarPathVisible, sidebarRegistryPath, SIDEBAR_ITEM_REGISTRY } from "../sidebar-nav/index.js";
import {
  STATUS_AVAILABLE,
  STATUS_CLAIMED,
  STATUS_COMPLETED,
  STATUS_IN_PROGRESS,
  TASK_INTERNAL_OFFERWALL,
  TASK_LOGIN_DAY,
} from "./tasks.constants.js";
import {
  getDailyTaskPeriodKey,
  getNextDailyTaskResetAt,
  normalizeDailyTaskResetCadence,
  type DailyTaskResetCadence,
} from "./tasks.period.js";
import * as repo from "./tasks.repository.js";
import type { BumpDailyTasksOpts, ClaimDailyTaskResult, DailyTaskDashboard } from "./tasks.types.js";

const CHECKIN_SIDEBAR_PATH = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.checkin?.path, "checkin");
const INTERNAL_OFFERWALL_SIDEBAR_PATH = SIDEBAR_ITEM_REGISTRY.internal_offerwall?.path ?? null;

// ─── progress ───────────────────────────────────────────────────────────────

/**
 * Increments progress for all active definitions of a task type (idempotent per dedupeKey).
 * This is the shared implementation behind the four public `notifyDailyTask*` hooks below.
 */
export async function bumpDailyTasksForUser(userId: number, taskType: string, opts: BumpDailyTasksOpts): Promise<void> {
  const { dedupeKey, delta, gameSlug, internalOfferwallOfferId } = opts;
  if (!userId || !dedupeKey) return;
  const d = Number(delta);
  if (!Number.isFinite(d) || d <= 0) return;

  const now = new Date();
  const defs = await repo.findActiveDefinitionsByType(taskType, now);
  const deltaDec = new Prisma.Decimal(String(d));

  for (const def of defs) {
    if (taskType === TASK_INTERNAL_OFFERWALL) {
      const scoped = def.internalOfferwallOfferId;
      if (scoped != null) {
        if (internalOfferwallOfferId == null || scoped !== internalOfferwallOfferId) continue;
      }
    }
    if (def.gameSlug) {
      if (!gameSlug || def.gameSlug !== gameSlug) continue;
    }
    const cadence = normalizeDailyTaskResetCadence(def.resetCadence);
    const periodKey = getDailyTaskPeriodKey(now, cadence);

    await prisma.$transaction(async (tx) => {
      const ok = await repo.tryConsumeDedupe(tx, def.id, dedupeKey);
      if (!ok) return;

      const target = Number(new Prisma.Decimal(def.targetValue.toString()));
      if (!Number.isFinite(target) || target <= 0) return;

      const row = await repo.upsertProgressTx(tx, { userId, taskDefinitionId: def.id, periodKey, delta: deltaDec });
      if (!row || row.rewardClaimedAt || row.completedAt) return;

      const cur = Number(new Prisma.Decimal(row.currentValue.toString()));
      if (cur < target) return;

      await repo.markProgressCompletedTx(tx, row.id, now);
    });
  }
}

/** Fired after a confirmed daily check-in. */
export async function notifyDailyTaskLoginDay(userId: number, checkinDateKey: string): Promise<void> {
  if (!userId || !checkinDateKey) return;
  await bumpDailyTasksForUser(userId, TASK_LOGIN_DAY, { dedupeKey: `login-${checkinDateKey}`, delta: 1 });
}

/** Fired after a confirmed BLK mining reward log row. */
export async function notifyDailyTaskBlkMined(userId: number, blkRewardLogId: number, amountBlk: number): Promise<void> {
  if (!userId || !blkRewardLogId) return;
  const amt = Number(amountBlk);
  if (!Number.isFinite(amt) || amt <= 0) return;
  await bumpDailyTasksForUser(userId, "MINE_BLK", { dedupeKey: `blklog-${blkRewardLogId}`, delta: amt });
}

/** Fired after a completed power-game session (game2048, etc). */
export async function notifyDailyTaskGamePlayed(
  userId: number,
  args: { userPowerGameId: number; gameSlug?: string | null },
): Promise<void> {
  if (!userId || !args.userPowerGameId) return;
  await bumpDailyTasksForUser(userId, "PLAY_GAMES", {
    dedupeKey: `game-${args.userPowerGameId}`,
    delta: 1,
    gameSlug: args.gameSlug ?? null,
  });
}

/** Fired after a confirmed YouTube watch-time claim. */
export async function notifyDailyTaskYoutubeWatch(userId: number, youtubeWatchHistoryId: number): Promise<void> {
  if (!userId || !youtubeWatchHistoryId) return;
  await bumpDailyTasksForUser(userId, "WATCH_YOUTUBE", { dedupeKey: `yt-${youtubeWatchHistoryId}`, delta: 1 });
}

/** Fired after a completed internal-offerwall attempt. */
export async function notifyDailyTaskInternalOfferwallCompleted(
  userId: number,
  attemptId: number,
  internalOfferwallOfferId: number,
): Promise<void> {
  if (!userId || !attemptId) return;
  await bumpDailyTasksForUser(userId, TASK_INTERNAL_OFFERWALL, {
    dedupeKey: `offerwall-${attemptId}`,
    delta: 1,
    internalOfferwallOfferId,
  });
}

// ─── dashboard ──────────────────────────────────────────────────────────────

function deriveStatus(row: { rewardClaimedAt: Date | null; completedAt: Date | null; currentValue: Prisma.Decimal } | null): string {
  if (row?.rewardClaimedAt) return STATUS_CLAIMED;
  if (row?.completedAt) return STATUS_COMPLETED;
  const cur = row ? Number(new Prisma.Decimal(row.currentValue.toString())) : 0;
  if (cur > 0) return STATUS_IN_PROGRESS;
  return STATUS_AVAILABLE;
}

function rewardSummary(def: {
  rewardKind: string;
  rewardBlkAmount: Prisma.Decimal | null;
  rewardPolAmount: Prisma.Decimal | null;
  rewardHashRate: number | null;
  rewardHashRateDays: number | null;
}): Record<string, unknown> {
  const kind = String(def.rewardKind || "").toUpperCase();
  if (kind === "BLK" && def.rewardBlkAmount) return { kind, amount: def.rewardBlkAmount.toString() };
  if (kind === "POL" && def.rewardPolAmount) return { kind, amount: def.rewardPolAmount.toString() };
  if (kind === "HASHRATE_TEMP") return { kind, hashRate: def.rewardHashRate ?? 0, days: def.rewardHashRateDays ?? 1 };
  if (kind === "SHOP_MINER" || kind === "EVENT_MINER") return { kind };
  return { kind: kind || "NONE" };
}

/** Hides login-day / internal-offerwall tasks when the corresponding sidebar page is disabled. */
export async function filterDailyTaskDefsForSidebar<T extends { taskType: string }>(defs: T[]): Promise<T[]> {
  const [checkinOn, offerwallOn] = await Promise.all([
    isSidebarPathVisible(CHECKIN_SIDEBAR_PATH),
    INTERNAL_OFFERWALL_SIDEBAR_PATH ? isSidebarPathVisible(INTERNAL_OFFERWALL_SIDEBAR_PATH) : Promise.resolve(false),
  ]);
  return defs.filter((def) => {
    if (def.taskType === TASK_LOGIN_DAY) return checkinOn;
    if (def.taskType === TASK_INTERNAL_OFFERWALL) return Boolean(offerwallOn);
    return true;
  });
}

export async function getDailyTasksDashboard(userId: number): Promise<DailyTaskDashboard> {
  const now = new Date();
  const defaultPeriodKey = getDailyTaskPeriodKey(now);
  const defsRaw = await repo.findActiveDefinitions(now);
  const defs = await filterDailyTaskDefsForSidebar(defsRaw);

  const periodByDef = new Map<number, string>();
  const periodKeys = new Set<string>();
  const nextResetByDefId = new Map<number, string>();
  let nextResetAtMs = Number.POSITIVE_INFINITY;
  for (const def of defs) {
    const cadence = normalizeDailyTaskResetCadence(def.resetCadence) as DailyTaskResetCadence;
    const key = getDailyTaskPeriodKey(now, cadence);
    periodByDef.set(def.id, key);
    periodKeys.add(key);
    const nextReset = getNextDailyTaskResetAt(now, cadence);
    nextResetByDefId.set(def.id, nextReset.toISOString());
    const resetAt = nextReset.getTime();
    if (Number.isFinite(resetAt) && resetAt < nextResetAtMs) nextResetAtMs = resetAt;
  }

  const progressRows = await repo.findProgressForUserInPeriods(userId, Array.from(periodKeys));
  const byDefPeriod = new Map(progressRows.map((p) => [`${p.taskDefinitionId}:${p.periodKey}`, p]));

  const tasks = defs.map((def) => {
    const periodKey = periodByDef.get(def.id) || defaultPeriodKey;
    const row = byDefPeriod.get(`${def.id}:${periodKey}`) || null;
    const target = Number(new Prisma.Decimal(def.targetValue.toString()));
    const current = row ? Number(new Prisma.Decimal(row.currentValue.toString())) : 0;
    const resetCadence = normalizeDailyTaskResetCadence(def.resetCadence);
    return {
      id: def.id,
      slug: def.slug,
      taskType: def.taskType,
      resetCadence,
      translationKey: def.translationKey,
      periodKey,
      nextResetAt: nextResetByDefId.get(def.id) || getNextDailyTaskResetAt(now, resetCadence).toISOString(),
      targetValue: target,
      currentValue: current,
      status: deriveStatus(row),
      reward: rewardSummary(def),
      gameSlug: def.gameSlug,
    };
  });

  return {
    periodKey: defaultPeriodKey,
    serverTime: now.toISOString(),
    nextResetAt: Number.isFinite(nextResetAtMs) ? new Date(nextResetAtMs).toISOString() : getNextDailyTaskResetAt(now).toISOString(),
    tasks,
  };
}

// ─── claim ──────────────────────────────────────────────────────────────────

export async function claimDailyTaskReward(userId: number, taskDefinitionId: number): Promise<ClaimDailyTaskResult> {
  try {
    const checkinEnabled = await isSidebarPathVisible(CHECKIN_SIDEBAR_PATH);

    const out = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.isBanned) {
        throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
      }

      const def = await tx.dailyTaskDefinition.findFirst({ where: { id: taskDefinitionId, isActive: true } });
      if (!def) {
        throw Object.assign(new Error("TASK_NOT_FOUND"), { code: "NOT_FOUND" });
      }
      if (def.taskType === TASK_LOGIN_DAY && !checkinEnabled) {
        throw Object.assign(new Error("TASK_NOT_FOUND"), { code: "NOT_FOUND" });
      }
      const cadence = normalizeDailyTaskResetCadence(def.resetCadence);
      const periodKey = getDailyTaskPeriodKey(new Date(), cadence);

      const progress = await tx.userDailyTaskProgress.findUnique({
        where: { userId_taskDefinitionId_periodKey: { userId, taskDefinitionId, periodKey } },
      });

      if (!progress?.completedAt) {
        throw Object.assign(new Error("NOT_COMPLETED"), { code: "NOT_COMPLETED" });
      }
      if (progress.rewardClaimedAt) {
        throw Object.assign(new Error("ALREADY_CLAIMED"), { code: "ALREADY_CLAIMED" });
      }

      const locked = await tx.userDailyTaskProgress.updateMany({
        where: { id: progress.id, rewardClaimedAt: null, completedAt: { not: null } },
        data: { rewardClaimedAt: new Date() },
      });
      if (locked.count !== 1) {
        throw Object.assign(new Error("ALREADY_CLAIMED"), { code: "ALREADY_CLAIMED" });
      }

      let inboxPayload: InboxRewardPayload | null = null;
      const kind = String(def.rewardKind || "").toUpperCase();

      if (kind === "POL" && def.rewardPolAmount && Number(def.rewardPolAmount) > 0) {
        inboxPayload = { userId, source: "daily_task", rewardType: "pol", rewardValue: Number(def.rewardPolAmount) };
      } else if (kind === "BLK" && def.rewardBlkAmount && Number(def.rewardBlkAmount) > 0) {
        inboxPayload = { userId, source: "daily_task", rewardType: "blk", rewardValue: Number(def.rewardBlkAmount) };
      } else if (kind === "HASHRATE_TEMP" && def.rewardHashRate && Number(def.rewardHashRate) > 0) {
        const days = Math.max(1, Number(def.rewardHashRateDays || 1));
        inboxPayload = {
          userId,
          source: "daily_task",
          rewardType: "temporary_power",
          rewardValue: Number(def.rewardHashRate),
          durationHours: days * 24,
        };
      } else if (kind === "SHOP_MINER" && def.rewardMinerId) {
        const miner = await tx.miner.findUnique({
          where: { id: def.rewardMinerId },
          select: { id: true, name: true, baseHashRate: true, imageUrl: true, slotSize: true },
        });
        if (miner) {
          inboxPayload = {
            userId,
            source: "daily_task",
            rewardType: "machine",
            rewardValue: Number(miner.baseHashRate ?? 0),
            minerId: miner.id,
            minerName: miner.name,
            minerImageUrl: miner.imageUrl,
            slotSize: miner.slotSize ?? 1,
          };
        }
      } else if (kind === "EVENT_MINER" && def.rewardEventMinerId) {
        const em = await tx.eventMiner.findUnique({
          where: { id: def.rewardEventMinerId },
          select: { name: true, imageUrl: true, hashRate: true, slotSize: true },
        });
        if (em) {
          inboxPayload = {
            userId,
            source: "daily_task",
            rewardType: "machine",
            rewardValue: Number(em.hashRate ?? 0),
            minerId: null,
            minerName: `[Event] ${em.name}`,
            minerImageUrl: em.imageUrl,
            slotSize: em.slotSize ?? 1,
            metaJson: { eventMinerId: def.rewardEventMinerId },
          };
        }
      }

      if (inboxPayload) await createRewardInboxEntry(tx, inboxPayload);

      await repo.createAuditLogTx(tx, {
        userId,
        action: "DAILY_TASK_CLAIM",
        detailsJson: JSON.stringify({ taskDefinitionId, periodKey, slug: def.slug, rewardKind: def.rewardKind }),
      });

      return { summary: { kind: def.rewardKind } };
    });

    return { ok: true, summary: out.summary };
  } catch (e: unknown) {
    const code = e instanceof Error && "code" in e ? (e as { code?: string }).code : undefined;
    if (code === "NOT_COMPLETED") return { ok: false, code: "not_completed", status: 400 };
    if (code === "ALREADY_CLAIMED") return { ok: false, code: "already_claimed", status: 409 };
    if (code === "NOT_FOUND") return { ok: false, code: "not_found", status: 404 };
    if (code === "FORBIDDEN") return { ok: false, code: "forbidden", status: 403 };
    throw e;
  }
}
