/**
 * Internal 3-step shortlink (+50 H/s). ZerAds/PasteAd flow lives in shortlinks-pastead.service.ts.
 */
import prisma from "../../core/database/prisma.js";
import type { TxClient } from "../../core/database/prisma.js";
import { getUtcDayKey, isSameUtcDay, getUtcPeriodResetAt } from "../../shared/calendar/utcCalendar.js";
import {
  resolveRewardExpiresAtForGrant,
  formatRewardDurationPt,
  rewardDurationHoursFromMs,
  getRewardDurationMs,
} from "../boosts/index.js";
import { logger } from "../../core/logger/index.js";
import * as shortlinksRepo from "./shortlinks.repository.js";
import { generateStepToken, detectStepFraud } from "./shortlinks.session.js";
import { buildPasteadStatus } from "./shortlinks-pastead.service.js";
import { buildAdlinkflyStatus } from "./shortlinks-adlinkfly.service.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import {
  TOTAL_STEPS,
  MAX_DAILY_RUNS,
  REWARD_HASH_RATE,
  MIN_STEP_INTERVAL_MS,
  type ShortlinkSecurityFlags,
  type StartShortlinkOutcome,
  type CompleteStepOutcome,
  type CompleteStepAuditContext,
} from "./shortlinks.types.js";

const log = logger.child("shortlinks.service");

export { TOTAL_STEPS, MAX_DAILY_RUNS, REWARD_HASH_RATE };
export { startPasteadForUser, markPasteadDoneForUser, claimPasteadForUser } from "./shortlinks-pastead.service.js";
export {
  startAdlinkflyForUser,
  markAdlinkflyDoneForUser,
  claimAdlinkflyForUser,
} from "./shortlinks-adlinkfly.service.js";

type CompletionStatus = Awaited<ReturnType<typeof shortlinksRepo.findCompletionStatus>>;

async function advisoryLock(tx: TxClient, key: string): Promise<void> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, key);
}

async function resetDailyIfNeeded(status: CompletionStatus): Promise<CompletionStatus> {
  if (!status) return status;
  const now = new Date();
  const lastCompletion = status.completedAt || status.resetAt;
  if (status.dailyRuns > 0 && lastCompletion && !isSameUtcDay(getUtcDayKey(lastCompletion), getUtcDayKey(now))) {
    return shortlinksRepo.resetDailyRuns(status.userId, now);
  }
  return status;
}

export async function getStatusForUser(userId: number) {
  let status = await shortlinksRepo.findCompletionStatus(userId);
  if (!status) {
    status = await shortlinksRepo.createCompletionStatus(userId);
  }
  status = await resetDailyIfNeeded(status);
  if (!status) return null;

  const ttlMs = await getRewardDurationMs(userId, "shortlinks");
  const now = new Date();
  const dayKey = getUtcDayKey(now);
  const resetAt = getUtcPeriodResetAt(dayKey);
  const pastead = await buildPasteadStatus(userId, ttlMs);
  const adlinkfly = await buildAdlinkflyStatus(userId, ttlMs);

  return {
    dailyReset: {
      timezone: "UTC",
      localDate: dayKey,
      resetAt: resetAt.toISOString(),
      nextResetInMs: Math.max(0, resetAt.getTime() - now.getTime()),
    },
    status: {
      currentStep: status.currentStep,
      dailyRuns: status.dailyRuns,
      shortlinkName: "Internal Shortlink",
      rewardName: `+${REWARD_HASH_RATE} H/s por ${formatRewardDurationPt(ttlMs)}`,
      totalSteps: TOTAL_STEPS,
      maxDailyRuns: MAX_DAILY_RUNS,
      inProgress: status.currentStep > 0,
    },
    pastead,
    adlinkfly,
  };
}

export async function startForUser(userId: number): Promise<StartShortlinkOutcome> {
  let status = await shortlinksRepo.findCompletionStatus(userId);
  status = await resetDailyIfNeeded(status);

  if (!status) {
    return { ok: false, reason: "server_error" };
  }

  if (status.dailyRuns >= MAX_DAILY_RUNS) {
    return { ok: false, reason: "daily_limit" };
  }

  const now = new Date();
  const sessionToken = generateStepToken(userId, 1, now);
  await shortlinksRepo.upsertSessionStart(userId, sessionToken, now);
  return { ok: true, nextStep: 1, sessionToken };
}

export async function completeStepForUser(
  userId: number,
  normalizedStep: number,
  sessionToken: unknown,
  securityFlags: ShortlinkSecurityFlags | undefined,
  audit: CompleteStepAuditContext,
): Promise<CompleteStepOutcome> {
  const now = new Date();

  const status = await shortlinksRepo.findCompletionStatus(userId);
  if (!status || !status.sessionToken) return { ok: false, reason: "no_session" };

  const freshStatus = await resetDailyIfNeeded(status);
  if (freshStatus && freshStatus.dailyRuns >= MAX_DAILY_RUNS) {
    return { ok: false, reason: "daily_limit" };
  }

  const incidents = detectStepFraud({
    expectedToken: status.sessionToken,
    providedToken: sessionToken,
    isUntrustedEvent: securityFlags?.isUntrustedEvent,
    stepStartedAt: status.stepStartedAt,
    now,
    minIntervalMs: MIN_STEP_INTERVAL_MS,
  });

  if (incidents.length > 0) {
    await prisma.auditLog.create({
      data: {
        userId,
        action: "shortlink_cheat_attempt",
        ip: audit.ip,
        userAgent: audit.userAgent,
        detailsJson: JSON.stringify({ step: normalizedStep, incidents }),
      },
    });
    return { ok: false, reason: "detected", incidents };
  }

  const isLastStep = normalizedStep === TOTAL_STEPS;
  const nextStep = isLastStep ? 0 : normalizedStep + 1;
  const nextSessionToken = isLastStep ? null : generateStepToken(userId, nextStep, now);

  await prisma.$transaction(async (tx) => {
    await advisoryLock(tx, `shortlink:${userId}`);

    if (isLastStep) {
      const fresh = await shortlinksRepo.findCompletionStatusTx(tx, userId);
      if (!fresh || fresh.currentStep !== normalizedStep) {
        throw new Error("STEP_MISMATCH");
      }
    }

    await shortlinksRepo.updateStepProgressTx(tx, userId, {
      currentStep: nextStep,
      dailyRunsIncrement: isLastStep ? 1 : undefined,
      completedAt: isLastStep ? now : undefined,
      sessionToken: nextSessionToken,
      stepStartedAt: now,
    });

    if (isLastStep) {
      const { expiresAt, durationMs } = await resolveRewardExpiresAtForGrant(tx, userId, now, "shortlinks");
      const durationHours = rewardDurationHoursFromMs(durationMs);
      await shortlinksRepo.createShortlinkPowerTx(tx, { userId, hashRate: REWARD_HASH_RATE, claimedAt: now, expiresAt });
      await shortlinksRepo.createAuditLogRowTx(tx, {
        userId,
        action: "shortlink_power_claimed",
        detailsJson: JSON.stringify({ hashRate: REWARD_HASH_RATE, durationHours, ttlMs: durationMs, expiresAt }),
        ip: audit.ip,
        userAgent: audit.userAgent,
      });
    }
  });

  let rewardMessage: string | null = null;
  if (isLastStep) {
    const ttlMs = await getRewardDurationMs(userId, "shortlinks");
    rewardMessage = `+${REWARD_HASH_RATE} H/s ativado por ${formatRewardDurationPt(ttlMs)}!`;
    log.info("Shortlink claim completed", { userId, hashRate: REWARD_HASH_RATE });
    void recordTournamentAction({
      userId,
      provider: TOURNAMENT_ACTION_PROVIDER.SHORTLINK,
      actionCount: 1,
      executedAtUTC: now,
      providerEventId: `shortlink:internal:${userId}:${now.toISOString()}`,
      metadata: { hashRate: REWARD_HASH_RATE, source: "internal" },
    }).catch((err) => log.warn("tournament.action.failed", { userId, error: String(err) }));
  }

  return {
    ok: true,
    step: normalizedStep,
    runCompleted: isLastStep,
    sessionToken: nextSessionToken,
    rewardMessage,
  };
}
