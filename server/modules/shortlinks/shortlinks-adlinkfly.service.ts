/**
 * AdLinkFly external shortlink — same reward/cap/TTL as ZerAds pastead, isolated provider slug.
 * Kept in maintenance by default via ADLINKFLY_SHORTLINK_MAINTENANCE.
 */
import crypto from "node:crypto";
import prisma from "../../core/database/prisma.js";
import type { TxClient } from "../../core/database/prisma.js";
import { getUtcDayKey, getUtcPeriodResetAt, getUtcPeriodStartAt } from "../../shared/calendar/utcCalendar.js";
import {
  resolveRewardExpiresAtForGrant,
  formatRewardDurationPt,
  rewardDurationHoursFromMs,
  getRewardDurationMs,
} from "../boosts/index.js";
import { APP_URL } from "../auth/auth.service.js";
import { logger } from "../../core/logger/index.js";
import * as shortlinksRepo from "./shortlinks.repository.js";
import { createAdlinkflyShrink, isAdlinkflyShortlinkApiEnabled } from "./adlinkfly-shortlink.api.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import {
  ADLINKFLY_PROVIDER,
  PASTEAD_REWARD_HS,
  PASTEAD_DAILY_HS_CAP,
  PASTEAD_MIN_ELAPSED_MS,
  PASTEAD_SESSION_TTL_MS,
  PASTEAD_MAX_DAILY_RUNS,
  type StartPasteadOutcome,
  type MarkPasteadDoneOutcome,
  type ClaimPasteadOutcome,
  type CompleteStepAuditContext,
  type PasteadStatusPayload,
} from "./shortlinks.types.js";

const log = logger.child("shortlinks.adlinkfly");

function adlinkflyEnabled(): boolean {
  return isAdlinkflyShortlinkApiEnabled();
}

function adlinkflyDoneUrl(token: string): string {
  const base = APP_URL.replace(/\/$/, "");
  return `${base}/shortlinks/adlinkfly/done?t=${encodeURIComponent(token)}`;
}

type DayContext = {
  now: Date;
  dayStart: Date;
  dayEnd: Date;
  ttlCutoff: Date;
};

function dayContext(now = new Date()): DayContext {
  const dayKey = getUtcDayKey(now);
  return {
    now,
    dayStart: getUtcPeriodStartAt(dayKey),
    dayEnd: getUtcPeriodResetAt(dayKey),
    ttlCutoff: new Date(now.getTime() - PASTEAD_SESSION_TTL_MS),
  };
}

async function advisoryLock(tx: TxClient, key: string): Promise<void> {
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, key);
}

export async function expireStaleAdlinkflySessions(now = new Date()): Promise<number> {
  const ttlCutoff = new Date(now.getTime() - PASTEAD_SESSION_TTL_MS);
  return shortlinksRepo.expireAllStalePendingExternalSessions(ADLINKFLY_PROVIDER, ttlCutoff);
}

async function expireUserStale(userId: number, ttlCutoff: Date): Promise<void> {
  await shortlinksRepo.expirePendingExternalSessions(userId, ADLINKFLY_PROVIDER, ttlCutoff);
}

function isDailyCapReached(completedRuns: number): boolean {
  return completedRuns * PASTEAD_REWARD_HS + PASTEAD_REWARD_HS > PASTEAD_DAILY_HS_CAP;
}

export async function buildAdlinkflyStatus(userId: number, rewardTtlMs: number): Promise<PasteadStatusPayload> {
  const { dayStart, dayEnd, ttlCutoff } = dayContext();

  if (!adlinkflyEnabled()) {
    return {
      enabled: false,
      shortlinkName: "AdLinkFly Shortlink",
      rewardName: `+${PASTEAD_REWARD_HS} H/s por ${formatRewardDurationPt(rewardTtlMs)}`,
      rewardHs: PASTEAD_REWARD_HS,
      dailyHsEarned: 0,
      dailyHsCap: PASTEAD_DAILY_HS_CAP,
      dailyRuns: 0,
      maxDailyRuns: PASTEAD_MAX_DAILY_RUNS,
      available: false,
      pending: false,
      pendingToken: null,
      doneReached: false,
      claimReadyAt: null,
      maintenance: true,
    };
  }

  const { dailyRuns, activePending } = await shortlinksRepo.loadPasteadStatusSnapshot(
    userId,
    ADLINKFLY_PROVIDER,
    dayStart,
    dayEnd,
    ttlCutoff,
  );
  const dailyHsEarned = dailyRuns * PASTEAD_REWARD_HS;

  return {
    enabled: true,
    shortlinkName: "AdLinkFly Shortlink",
    rewardName: `+${PASTEAD_REWARD_HS} H/s por ${formatRewardDurationPt(rewardTtlMs)}`,
    rewardHs: PASTEAD_REWARD_HS,
    dailyHsEarned,
    dailyHsCap: PASTEAD_DAILY_HS_CAP,
    dailyRuns,
    maxDailyRuns: PASTEAD_MAX_DAILY_RUNS,
    available: dailyHsEarned + PASTEAD_REWARD_HS <= PASTEAD_DAILY_HS_CAP,
    pending: Boolean(activePending),
    pendingToken: activePending?.token ?? null,
    doneReached: Boolean(activePending?.doneAt),
    claimReadyAt: activePending
      ? new Date(activePending.createdAt.getTime() + PASTEAD_MIN_ELAPSED_MS).toISOString()
      : null,
    maintenance: false,
  };
}

export async function startAdlinkflyForUser(userId: number): Promise<StartPasteadOutcome> {
  if (!adlinkflyEnabled()) return { ok: false, reason: "disabled" };

  const { dayStart, dayEnd, ttlCutoff } = dayContext();
  await expireUserStale(userId, ttlCutoff);

  const { dailyRuns, activePending } = await shortlinksRepo.loadPasteadStatusSnapshot(
    userId,
    ADLINKFLY_PROVIDER,
    dayStart,
    dayEnd,
    ttlCutoff,
  );
  if (isDailyCapReached(dailyRuns)) {
    return { ok: false, reason: "daily_limit" };
  }

  if (activePending) {
    const shrink = await createAdlinkflyShrink(adlinkflyDoneUrl(activePending.token));
    if (shrink.ok) {
      return { ok: true, token: activePending.token, externalUrl: shrink.externalUrl };
    }
    log.warn("adlinkfly.shortlink.reuse_shrink_failed", { userId, reason: shrink.reason });
  }

  await shortlinksRepo.cancelPendingExternalSessions(userId, ADLINKFLY_PROVIDER);
  const token = crypto.randomBytes(24).toString("hex");
  try {
    await shortlinksRepo.createExternalSession({
      userId,
      provider: ADLINKFLY_PROVIDER,
      token,
      hashRate: PASTEAD_REWARD_HS,
    });
  } catch (err) {
    log.error("adlinkfly.start.create_failed", { userId, error: String(err) });
    return { ok: false, reason: "server_error" };
  }

  const shrink = await createAdlinkflyShrink(adlinkflyDoneUrl(token));
  if (!shrink.ok) {
    await prisma.shortlinkExternalSession.updateMany({
      where: { userId, provider: ADLINKFLY_PROVIDER, token, status: "pending" },
      data: { status: "expired" },
    });
    log.warn("adlinkfly.shortlink.shrink_failed", { userId, reason: shrink.reason });
    return { ok: false, reason: "api_error" };
  }

  return { ok: true, token, externalUrl: shrink.externalUrl };
}

export async function markAdlinkflyDoneForUser(
  userId: number,
  token: unknown,
): Promise<MarkPasteadDoneOutcome> {
  if (!adlinkflyEnabled()) return { ok: false, reason: "disabled" };

  const { now, ttlCutoff } = dayContext();
  await expireUserStale(userId, ttlCutoff);

  const tokenStr = typeof token === "string" ? token.trim() : "";
  if (tokenStr.length < 16 || tokenStr.length > 128) {
    return { ok: false, reason: "no_session" };
  }

  const session = await shortlinksRepo.findPendingExternalSession(userId, ADLINKFLY_PROVIDER, tokenStr);
  if (!session) return { ok: false, reason: "no_session" };

  const elapsedMs = now.getTime() - session.createdAt.getTime();
  if (elapsedMs > PASTEAD_SESSION_TTL_MS) {
    await prisma.shortlinkExternalSession.update({
      where: { id: session.id },
      data: { status: "expired" },
    });
    return { ok: false, reason: "expired" };
  }

  if (!session.doneAt) {
    await shortlinksRepo.markExternalSessionDone(session.id, now);
  }

  return {
    ok: true,
    token: tokenStr,
    claimReadyAt: new Date(session.createdAt.getTime() + PASTEAD_MIN_ELAPSED_MS).toISOString(),
  };
}

export async function claimAdlinkflyForUser(
  userId: number,
  token: unknown,
  audit: CompleteStepAuditContext,
): Promise<ClaimPasteadOutcome> {
  if (!adlinkflyEnabled()) return { ok: false, reason: "disabled" };

  const { now, dayStart, dayEnd, ttlCutoff } = dayContext();
  await expireUserStale(userId, ttlCutoff);

  const tokenStr = typeof token === "string" ? token.trim() : "";
  if (tokenStr.length < 16 || tokenStr.length > 128) {
    return { ok: false, reason: "no_session" };
  }

  const session = await shortlinksRepo.findPendingExternalSession(userId, ADLINKFLY_PROVIDER, tokenStr);
  if (!session) return { ok: false, reason: "no_session" };

  const elapsedMs = now.getTime() - session.createdAt.getTime();
  if (elapsedMs > PASTEAD_SESSION_TTL_MS) {
    await prisma.shortlinkExternalSession.update({
      where: { id: session.id },
      data: { status: "expired" },
    });
    return { ok: false, reason: "expired" };
  }
  if (!session.doneAt) {
    return { ok: false, reason: "not_completed" };
  }
  if (elapsedMs < PASTEAD_MIN_ELAPSED_MS) {
    return { ok: false, reason: "too_fast" };
  }

  const { dailyRuns } = await shortlinksRepo.loadPasteadStatusSnapshot(
    userId,
    ADLINKFLY_PROVIDER,
    dayStart,
    dayEnd,
    ttlCutoff,
  );
  if (isDailyCapReached(dailyRuns)) {
    return { ok: false, reason: "daily_limit" };
  }

  const hashRate = session.hashRate || PASTEAD_REWARD_HS;

  try {
    await prisma.$transaction(async (tx) => {
      await advisoryLock(tx, `shortlink:adlinkfly:${userId}`);

      const fresh = await tx.shortlinkExternalSession.findUnique({ where: { id: session!.id } });
      if (!fresh || fresh.status !== "pending" || !fresh.doneAt) {
        throw new Error(fresh?.doneAt ? "ADLINKFLY_SESSION_GONE" : "ADLINKFLY_NOT_COMPLETED");
      }

      const completedToday = await tx.shortlinkExternalSession.count({
        where: {
          userId,
          provider: ADLINKFLY_PROVIDER,
          status: "completed",
          completedAt: { gte: dayStart, lt: dayEnd },
        },
      });
      if (completedToday * PASTEAD_REWARD_HS + hashRate > PASTEAD_DAILY_HS_CAP) {
        throw new Error("ADLINKFLY_DAILY_LIMIT");
      }

      await shortlinksRepo.completeExternalSessionTx(tx, session!.id, now);
      const { expiresAt, durationMs } = await resolveRewardExpiresAtForGrant(tx, userId, now, "shortlinks");
      const durationHours = rewardDurationHoursFromMs(durationMs);
      await shortlinksRepo.createShortlinkPowerTx(tx, { userId, hashRate, claimedAt: now, expiresAt });
      await shortlinksRepo.createAuditLogRowTx(tx, {
        userId,
        action: "adlinkfly_shortlink_claimed",
        detailsJson: JSON.stringify({
          provider: ADLINKFLY_PROVIDER,
          hashRate,
          durationHours,
          ttlMs: durationMs,
          expiresAt,
          sessionId: session!.id,
          doneAt: fresh.doneAt,
        }),
        ip: audit.ip,
        userAgent: audit.userAgent,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "ADLINKFLY_DAILY_LIMIT") return { ok: false, reason: "daily_limit" };
    if (msg === "ADLINKFLY_SESSION_GONE") return { ok: false, reason: "no_session" };
    if (msg === "ADLINKFLY_NOT_COMPLETED") return { ok: false, reason: "not_completed" };
    throw err;
  }

  const ttlMs = await getRewardDurationMs(userId, "shortlinks");
  const rewardMessage = `+${hashRate} H/s ativado por ${formatRewardDurationPt(ttlMs)}!`;
  log.info("AdLinkFly shortlink claimed", { userId, hashRate });
  void recordTournamentAction({
    userId,
    provider: TOURNAMENT_ACTION_PROVIDER.SHORTLINK,
    actionCount: 1,
    executedAtUTC: now,
    providerEventId: `shortlink:adlinkfly:${session!.id}`,
    metadata: { hashRate, source: ADLINKFLY_PROVIDER, sessionId: session!.id },
  }).catch((err) => log.warn("tournament.action.failed", { userId, error: String(err) }));
  return { ok: true, rewardMessage, hashRate };
}
