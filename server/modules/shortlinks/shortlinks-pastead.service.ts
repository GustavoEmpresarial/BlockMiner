/**
 * ZerAds / PasteAd external shortlink flow (+20 H/s, UTC daily H/s cap).
 * Separated from the internal 3-step shortlink to keep reads cheap and logic isolated.
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
import { createZeradsShrink, isZeradsShortlinkApiEnabled } from "./zerads-shortlink.api.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import {
  PASTEAD_PROVIDER,
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

const log = logger.child("shortlinks.pastead");

function pasteadEnabled(): boolean {
  return isZeradsShortlinkApiEnabled();
}

function pasteadDoneUrl(token: string): string {
  const base = APP_URL.replace(/\/$/, "");
  return `${base}/shortlinks/pastead/done?t=${encodeURIComponent(token)}`;
}

function pasteadFailedUrl(): string {
  const base = APP_URL.replace(/\/$/, "");
  return `${base}/shortlinks/pastead/failed`;
}

type PasteadDayContext = {
  now: Date;
  dayStart: Date;
  dayEnd: Date;
  ttlCutoff: Date;
};

function pasteadDayContext(now = new Date()): PasteadDayContext {
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

/** Cron-only — never call from hot read paths. */
export async function expireStalePasteadSessions(now = new Date()): Promise<number> {
  const ttlCutoff = new Date(now.getTime() - PASTEAD_SESSION_TTL_MS);
  return shortlinksRepo.expireAllStalePendingExternalSessions(PASTEAD_PROVIDER, ttlCutoff);
}

async function expireUserStalePastead(userId: number, ttlCutoff: Date): Promise<void> {
  await shortlinksRepo.expirePendingExternalSessions(userId, PASTEAD_PROVIDER, ttlCutoff);
}

function isDailyCapReached(completedRuns: number): boolean {
  return completedRuns * PASTEAD_REWARD_HS + PASTEAD_REWARD_HS > PASTEAD_DAILY_HS_CAP;
}

/** Read-only pastead slice for GET /shortlink/status — no ZerAds API, no global writes. */
export async function buildPasteadStatus(userId: number, rewardTtlMs: number): Promise<PasteadStatusPayload> {
  const { dayStart, dayEnd, ttlCutoff } = pasteadDayContext();

  if (!pasteadEnabled()) {
    return {
      enabled: false,
      shortlinkName: "ZerAds Shortlink",
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
    };
  }

  const { dailyRuns, activePending } = await shortlinksRepo.loadPasteadStatusSnapshot(
    userId,
    PASTEAD_PROVIDER,
    dayStart,
    dayEnd,
    ttlCutoff,
  );
  const dailyHsEarned = dailyRuns * PASTEAD_REWARD_HS;

  return {
    enabled: true,
    shortlinkName: "ZerAds Shortlink",
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
  };
}

export async function startPasteadForUser(userId: number): Promise<StartPasteadOutcome> {
  if (!pasteadEnabled()) return { ok: false, reason: "disabled" };

  const { dayStart, dayEnd, ttlCutoff } = pasteadDayContext();
  await expireUserStalePastead(userId, ttlCutoff);

  const { dailyRuns, activePending } = await shortlinksRepo.loadPasteadStatusSnapshot(
    userId,
    PASTEAD_PROVIDER,
    dayStart,
    dayEnd,
    ttlCutoff,
  );
  if (isDailyCapReached(dailyRuns)) {
    return { ok: false, reason: "daily_limit" };
  }

  if (activePending) {
    const shrink = await createZeradsShrink(pasteadDoneUrl(activePending.token), pasteadFailedUrl());
    if (shrink.ok) {
      return { ok: true, token: activePending.token, externalUrl: shrink.externalUrl };
    }
    log.warn("zerads.shortlink.reuse_shrink_failed", { userId, reason: shrink.reason });
  }

  await shortlinksRepo.cancelPendingExternalSessions(userId, PASTEAD_PROVIDER);
  const token = crypto.randomBytes(24).toString("hex");
  try {
    await shortlinksRepo.createExternalSession({
      userId,
      provider: PASTEAD_PROVIDER,
      token,
      hashRate: PASTEAD_REWARD_HS,
    });
  } catch (err) {
    log.error("pastead.start.create_failed", { userId, error: String(err) });
    return { ok: false, reason: "server_error" };
  }

  const shrink = await createZeradsShrink(pasteadDoneUrl(token), pasteadFailedUrl());
  if (!shrink.ok) {
    await prisma.shortlinkExternalSession.updateMany({
      where: { userId, provider: PASTEAD_PROVIDER, token, status: "pending" },
      data: { status: "expired" },
    });
    log.warn("zerads.shortlink.shrink_failed", { userId, reason: shrink.reason });
    return { ok: false, reason: "api_error" };
  }

  return { ok: true, token, externalUrl: shrink.externalUrl };
}

/**
 * Called when ZerAds redirects to `/shortlinks/pastead/done`.
 * Without this stamp, claim is rejected — closes the "wait timer → free reward" hole.
 */
export async function markPasteadDoneForUser(
  userId: number,
  token: unknown,
): Promise<MarkPasteadDoneOutcome> {
  if (!pasteadEnabled()) return { ok: false, reason: "disabled" };

  const { now, ttlCutoff } = pasteadDayContext();
  await expireUserStalePastead(userId, ttlCutoff);

  const tokenStr = typeof token === "string" ? token.trim() : "";
  if (tokenStr.length < 16 || tokenStr.length > 128) {
    return { ok: false, reason: "no_session" };
  }

  const session = await shortlinksRepo.findPendingExternalSession(userId, PASTEAD_PROVIDER, tokenStr);
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

export async function claimPasteadForUser(
  userId: number,
  token: unknown,
  audit: CompleteStepAuditContext,
): Promise<ClaimPasteadOutcome> {
  if (!pasteadEnabled()) return { ok: false, reason: "disabled" };

  const { now, dayStart, dayEnd, ttlCutoff } = pasteadDayContext();
  await expireUserStalePastead(userId, ttlCutoff);

  const tokenStr = typeof token === "string" ? token.trim() : "";
  if (tokenStr.length < 16 || tokenStr.length > 128) {
    return { ok: false, reason: "no_session" };
  }

  // Require the exact session token — no fallback to "any pending" (that enabled claim without ZerAds).
  const session = await shortlinksRepo.findPendingExternalSession(userId, PASTEAD_PROVIDER, tokenStr);
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
    PASTEAD_PROVIDER,
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
      await advisoryLock(tx, `shortlink:pastead:${userId}`);

      const fresh = await tx.shortlinkExternalSession.findUnique({ where: { id: session!.id } });
      if (!fresh || fresh.status !== "pending" || !fresh.doneAt) {
        throw new Error(fresh?.doneAt ? "PASTEAD_SESSION_GONE" : "PASTEAD_NOT_COMPLETED");
      }

      const completedToday = await tx.shortlinkExternalSession.count({
        where: {
          userId,
          provider: PASTEAD_PROVIDER,
          status: "completed",
          completedAt: { gte: dayStart, lt: dayEnd },
        },
      });
      if (completedToday * PASTEAD_REWARD_HS + hashRate > PASTEAD_DAILY_HS_CAP) {
        throw new Error("PASTEAD_DAILY_LIMIT");
      }

      await shortlinksRepo.completeExternalSessionTx(tx, session!.id, now);
      const { expiresAt, durationMs } = await resolveRewardExpiresAtForGrant(tx, userId, now, "shortlinks");
      const durationHours = rewardDurationHoursFromMs(durationMs);
      await shortlinksRepo.createShortlinkPowerTx(tx, { userId, hashRate, claimedAt: now, expiresAt });
      await shortlinksRepo.createAuditLogRowTx(tx, {
        userId,
        action: "pastead_shortlink_claimed",
        detailsJson: JSON.stringify({
          provider: PASTEAD_PROVIDER,
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
    if (msg === "PASTEAD_DAILY_LIMIT") return { ok: false, reason: "daily_limit" };
    if (msg === "PASTEAD_SESSION_GONE") return { ok: false, reason: "no_session" };
    if (msg === "PASTEAD_NOT_COMPLETED") return { ok: false, reason: "not_completed" };
    throw err;
  }

  const ttlMs = await getRewardDurationMs(userId, "shortlinks");
  const rewardMessage = `+${hashRate} H/s ativado por ${formatRewardDurationPt(ttlMs)}!`;
  log.info("PasteAd shortlink claimed", { userId, hashRate });
  void recordTournamentAction({
    userId,
    provider: TOURNAMENT_ACTION_PROVIDER.SHORTLINK,
    actionCount: 1,
    executedAtUTC: now,
    providerEventId: `shortlink:pastead:${session!.id}`,
    metadata: { hashRate, source: PASTEAD_PROVIDER, sessionId: session!.id },
  }).catch((err) => log.warn("tournament.action.failed", { userId, error: String(err) }));
  return { ok: true, rewardMessage, hashRate };
}
