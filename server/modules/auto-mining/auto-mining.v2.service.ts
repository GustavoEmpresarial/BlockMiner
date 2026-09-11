/**
 * Auto Mining GPU v2 — persistence and transactional grants.
 * Server-side scheduling prevents client time manipulation for claim eligibility.
 * Ported 1:1 from legacy/server/modules/auto-mining/application/auto-mining.v2.service.ts.
 *
 * Deviation from legacy: legacy imported hasActiveBoost/hasActiveBoostTx/
 * resolveRewardExpiresAtForGrant from services/powerBoostService.ts (owned by the
 * mining/boosts domain). `current/server/modules/boosts` has no service/index.ts yet (Fase 3
 * in progress), so the same small slice of that logic is inlined here, same as in
 * auto-mining.service.ts. Replace with a call through boosts/index.ts once that module exists.
 */
import prisma, { type TxClient } from "../../core/database/prisma.js";
import { isAutoMiningV2SchemaAvailable } from "./auto-mining.db-availability.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import { logger } from "../../core/logger/index.js";
import {
  MINING_MODES,
  DAILY_LIMIT_HASH,
  CYCLE_SECONDS,
  isClaimDue,
  canGrantDaily,
  validateImpressionForTurboClaim,
  assertValidMiningMode,
  nextClaimAfterSuccess,
  hashRateForMode,
  CLAIM_REQUIRED_SECONDS,
  HEARTBEAT_STALE_MS,
  CLAIM_SECONDS_COST,
  CLICK_GRACE_MS,
  MIN_CLICK_DELAY_MS,
  isHeartbeatStale,
  utcDayDailyResetMeta,
  endOfUtcCalendarDay,
  startOfUtcCalendarDay,
} from "./auto-mining.domain.js";

type DbClient = TxClient | typeof prisma;

const log = logger.child("AutoMiningV2Service");

const NORMAL_TTL_MS = 24 * 60 * 60 * 1000;
const BOOST_TTL_MS = 7 * NORMAL_TTL_MS;

function todayKeyUTC(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function hasActiveBoost(userId: number, now = new Date()): Promise<boolean> {
  const row = await prisma.dailyPowerBoost.findUnique({
    where: { userId_dayKey: { userId, dayKey: todayKeyUTC(now) } },
    select: { id: true },
  });
  return row != null;
}

async function hasActiveBoostTx(tx: TxClient, userId: number, now = new Date()): Promise<boolean> {
  const row = await tx.dailyPowerBoost.findUnique({
    where: { userId_dayKey: { userId, dayKey: todayKeyUTC(now) } },
    select: { id: true },
  });
  return row != null;
}

/** Immutable grant expiry: boost status for today's UTC day at creation time only. */
async function resolveRewardExpiresAtForGrant(
  tx: TxClient,
  userId: number,
  earnedAt: Date,
): Promise<{ expiresAt: Date; durationMs: number }> {
  const boosted = await hasActiveBoostTx(tx, userId, earnedAt);
  const durationMs = boosted ? BOOST_TTL_MS : NORMAL_TTL_MS;
  return { expiresAt: new Date(earnedAt.getTime() + durationMs), durationMs };
}

async function assertV2SchemaOrThrow() {
  if (!(await isAutoMiningV2SchemaAvailable())) {
    const err = new Error("Auto Mining v2 is not available yet (database migrations may be pending).") as Error & { code: string };
    err.code = "SCHEMA_UNAVAILABLE";
    throw err;
  }
}

function degradedStatusPayload() {
  const now = new Date();
  return {
    session: null,
    schemaUnavailable: true,
    serverNow: now.toISOString(),
    dailyUsedHash: 0,
    dailyLimitHash: DAILY_LIMIT_HASH,
    dailyRemainingHash: DAILY_LIMIT_HASH,
    dailyLimitReached: false,
    dailyReset: utcDayDailyResetMeta(now),
    activeHashTotal: 0,
    cycleSeconds: CYCLE_SECONDS,
    activeGrants: [],
    sessionEarningsHash: 0,
    bannerStatsToday: { impressions: 0, clicks: 0 },
    recentGrants: [],
  };
}

export async function sumDailyGrantedHash(userId: number, serverNow: Date, tx: DbClient = prisma): Promise<number> {
  const dayStart = startOfUtcCalendarDay(serverNow);
  const dayEnd = endOfUtcCalendarDay(serverNow);
  const agg = await tx.autoMiningV2PowerGrant.aggregate({
    where: { userId, earnedAt: { gte: dayStart, lt: dayEnd } },
    _sum: { hashRate: true },
  });
  return Number(agg._sum.hashRate || 0);
}

export async function deactivateUserSessions(userId: number, tx: DbClient = prisma): Promise<void> {
  await tx.autoMiningV2Session.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false },
  });
}

async function getUserPresence(userId: number, tx: DbClient = prisma) {
  const row = await tx.user.findUnique({
    where: { id: userId },
    select: {
      autoMiningSecondsBalance: true,
      autoMiningLastHeartbeatAt: true,
      lastHeartbeatAt: true,
    },
  });
  if (!row) return null;
  return {
    autoMiningSecondsBalance: row.autoMiningSecondsBalance,
    // Per-feature presence — reading the shared column let a YouTube heartbeat satisfy
    // auto-mining's proof of presence. Falls back only until the first post-deploy beat.
    lastHeartbeatAt: row.autoMiningLastHeartbeatAt ?? row.lastHeartbeatAt,
  };
}

/** Expected "not ready yet" states, carried with enough detail for the client to show a real
 *  reason and to back off — instead of hammering a 1s poll against a silent rejection. */
function notReadyError(
  code: "CLAIM_NOT_DUE" | "PRESENCE_INSUFFICIENT" | "PRESENCE_STALE" | "SESSION_PAUSED",
  extra: { retryAfterMs?: number; secondsShort?: number },
): Error & { code: string; retryAfterMs?: number; secondsShort?: number } {
  const err = new Error(code) as Error & { code: string; retryAfterMs?: number; secondsShort?: number };
  err.code = code;
  if (extra.retryAfterMs != null) err.retryAfterMs = extra.retryAfterMs;
  if (extra.secondsShort != null) err.secondsShort = extra.secondsShort;
  return err;
}

/** While the tab was away, do not auto-grant missed cycles — restart the countdown on return. */
async function resyncSessionAfterAbsence(
  userId: number,
  session: { id: string; nextClaimAt: Date },
  now: Date,
  tx: DbClient = prisma,
) {
  // A paused session is frozen on purpose — never push its timer.
  if ((session as { pausedAt?: Date | null }).pausedAt) return session;

  // Power Boost: user may background the /auto-mining tab (other browser tab / other app).
  // Browser timer throttling makes heartbeats sparse; do not treat that as absence.
  if (await hasActiveBoost(userId, now)) return session;

  const user = await getUserPresence(userId, tx);
  const stale = isHeartbeatStale(user?.lastHeartbeatAt ?? null, now);
  // Only an absence resets the timer. Bumping on `nextClaimAt <= now` meant the 45s status
  // poll silently pushed a due-but-unclaimed cycle 60s into the future — the user watched the
  // countdown restart forever while nothing was ever credited.
  if (!stale) return session;

  const nextClaimAt = new Date(now.getTime() + CYCLE_SECONDS * 1000);
  const bumped = await tx.autoMiningV2Session.updateMany({
    where: { id: session.id, isActive: true },
    data: { nextClaimAt },
  });
  if (bumped.count === 1) return { ...session, nextClaimAt };
  return session;
}

export async function startSession(userId: number, mode: string) {
  await assertV2SchemaOrThrow();
  const m = assertValidMiningMode(mode);
  const now = new Date();
  const nextClaimAt = new Date(now.getTime() + CYCLE_SECONDS * 1000);

  return prisma.$transaction(async (tx) => {
    await deactivateUserSessions(userId, tx);
    await tx.user.updateMany({
      where: { id: userId },
      // The presence clock is stamped along with the reset. Leaving it untouched meant the first
      // heartbeat of the session measured its elapsed time against the PREVIOUS session's beat,
      // so the first cycle accrued roughly one beat-interval less than a real minute and the
      // claim at 60s failed PRESENCE_INSUFFICIENT — the user watched the first minute go by with
      // nothing credited and only got paid on the retry.
      data: { autoMiningSecondsBalance: 0, autoMiningLastHeartbeatAt: now, lastHeartbeatAt: now },
    });
    return tx.autoMiningV2Session.create({
      data: { userId, mode: m, nextClaimAt, isActive: true },
    });
  });
}

export async function stopSession(userId: number) {
  if (!(await isAutoMiningV2SchemaAvailable())) return { count: 0 };
  return prisma.autoMiningV2Session.updateMany({
    where: { userId, isActive: true },
    data: { isActive: false, pausedAt: null, pausedRemainingMs: null },
  });
}

/**
 * Freezes the running cycle because the user left the page or the tab. Stores what was left of
 * the cycle so resuming continues from there instead of restarting — someone who steps away with
 * 5s to go should not lose the 55s they already spent on screen.
 * Idempotent: pausing an already-paused session keeps the first remaining value.
 */
export async function pauseSession(userId: number) {
  if (!(await isAutoMiningV2SchemaAvailable())) return { paused: false };
  const now = new Date();
  const session = await prisma.autoMiningV2Session.findFirst({
    where: { userId, isActive: true, pausedAt: null },
    select: { id: true, nextClaimAt: true },
  });
  if (!session) return { paused: false };

  const remainingMs = Math.max(0, session.nextClaimAt.getTime() - now.getTime());
  const res = await prisma.autoMiningV2Session.updateMany({
    where: { id: session.id, isActive: true, pausedAt: null },
    data: { pausedAt: now, pausedRemainingMs: remainingMs },
  });
  return { paused: res.count === 1, remainingMs };
}

/** Restarts the frozen cycle from where it stopped. Only the user can trigger this. */
export async function resumeSession(userId: number) {
  if (!(await isAutoMiningV2SchemaAvailable())) return { resumed: false };
  const now = new Date();
  const session = await prisma.autoMiningV2Session.findFirst({
    where: { userId, isActive: true, pausedAt: { not: null } },
    select: { id: true, pausedRemainingMs: true },
  });
  if (!session) return { resumed: false };

  const remainingMs = Math.min(
    CYCLE_SECONDS * 1000,
    Math.max(0, session.pausedRemainingMs ?? CYCLE_SECONDS * 1000),
  );
  const res = await prisma.autoMiningV2Session.updateMany({
    where: { id: session.id, isActive: true, pausedAt: { not: null } },
    data: {
      nextClaimAt: new Date(now.getTime() + remainingMs),
      pausedAt: null,
      pausedRemainingMs: null,
    },
  });
  // Clicking resume IS proof of presence. Without stamping it, the status payload built right
  // after this call ran resyncSessionAfterAbsence against a heartbeat that was stale by
  // definition (the user had been away) and immediately pushed nextClaimAt back to a full
  // cycle — so every resume restarted the countdown at 60s instead of the frozen remainder.
  if (res.count === 1) {
    await prisma.user.updateMany({
      where: { id: userId },
      data: { autoMiningLastHeartbeatAt: now, lastHeartbeatAt: now },
    });
  }
  return { resumed: res.count === 1 };
}

export async function getActiveSession(userId: number) {
  return prisma.autoMiningV2Session.findFirst({
    where: { userId, isActive: true },
  });
}

export async function pickPartnerBanner(tx: DbClient = prisma) {
  const banners = await tx.dashboardBanner.findMany({
    where: { isActive: true, link: { not: null } },
    take: 40,
    orderBy: { createdAt: "desc" },
  });
  const withLink = banners.filter((b) => String(b.link || "").trim().length > 0);
  if (withLink.length === 0) {
    const fallbackUrl = String(process.env.AUTO_MINING_V2_FALLBACK_URL || "https://blockminer.space/").trim();
    return { bannerKey: "fallback", targetUrl: fallbackUrl, title: "Partner", imageUrl: null };
  }
  const b = withLink[Math.floor(Math.random() * withLink.length)];
  return {
    bannerKey: `db:${b.id}`,
    targetUrl: String(b.link).trim(),
    title: b.title || "",
    imageUrl: b.imageUrl || null,
  };
}

export async function getStatusPayload(userId: number) {
  if (!(await isAutoMiningV2SchemaAvailable())) return degradedStatusPayload();

  const now = new Date();
  let session = await getActiveSession(userId);
  if (session) {
    const synced = await resyncSessionAfterAbsence(userId, session, now);
    if (synced.nextClaimAt.getTime() !== session.nextClaimAt.getTime()) {
      session = await getActiveSession(userId);
    }
  }
  const dailyUsed = await sumDailyGrantedHash(userId, now);
  const activeGrants = await prisma.autoMiningV2PowerGrant.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" },
    take: 80,
  });

  let sessionEarningsHash = 0;
  if (session) {
    const s = await prisma.autoMiningV2PowerGrant.aggregate({
      where: { userId, sessionId: session.id },
      _sum: { hashRate: true },
    });
    sessionEarningsHash = Number(s._sum.hashRate || 0);
  }

  const dayStart = startOfUtcCalendarDay(now);
  const dayEnd = endOfUtcCalendarDay(now);
  const activeHashTotal = activeGrants.reduce((sum, g) => sum + (Number(g.hashRate) || 0), 0);
  const [impToday, clickToday, recentGrants] = await Promise.all([
    prisma.autoMiningV2BannerImpression.count({ where: { userId, createdAt: { gte: dayStart, lt: dayEnd } } }),
    prisma.autoMiningV2BannerImpression.count({ where: { userId, clickedAt: { not: null, gte: dayStart, lt: dayEnd } } }),
    prisma.autoMiningV2PowerGrant.findMany({
      where: { userId },
      orderBy: { earnedAt: "desc" },
      take: 25,
      select: { id: true, hashRate: true, mode: true, earnedAt: true, expiresAt: true, sessionId: true },
    }),
  ]);

  return {
    session,
    serverNow: now.toISOString(),
    dailyReset: utcDayDailyResetMeta(now),
    dailyUsedHash: dailyUsed,
    dailyLimitHash: DAILY_LIMIT_HASH,
    dailyRemainingHash: Math.max(0, DAILY_LIMIT_HASH - dailyUsed),
    dailyLimitReached: dailyUsed >= DAILY_LIMIT_HASH,
    activeHashTotal,
    cycleSeconds: CYCLE_SECONDS,
    activeGrants,
    sessionEarningsHash,
    bannerStatsToday: { impressions: impToday, clicks: clickToday },
    recentGrants,
  };
}

export async function claimNormal(userId: number) {
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.autoMiningV2Session.findFirst({ where: { userId, isActive: true } });
    if (!session) {
      const err = new Error("NO_SESSION") as Error & { code: string };
      err.code = "NO_SESSION";
      throw err;
    }
    if (session.mode !== MINING_MODES.NORMAL) {
      const err = new Error("WRONG_MODE") as Error & { code: string };
      err.code = "WRONG_MODE";
      throw err;
    }
    if (session.pausedAt) {
      // Frozen because the user is away. The client shows a Resume button; nothing accrues.
      throw notReadyError("SESSION_PAUSED", {});
    }
    if (!isClaimDue(session.nextClaimAt, now)) {
      throw notReadyError("CLAIM_NOT_DUE", {
        retryAfterMs: Math.max(0, session.nextClaimAt.getTime() - now.getTime()),
      });
    }

    const boosted = await hasActiveBoostTx(tx, userId, now);
    const user = await getUserPresence(userId, tx);
    // Without boost: strict presence. With boost: wall-clock due is enough while /auto-mining
    // tab stays open (browser throttles heartbeats when the tab is backgrounded).
    if (!boosted) {
      if (!user || isHeartbeatStale(user.lastHeartbeatAt, now)) {
        throw notReadyError("PRESENCE_STALE", { retryAfterMs: HEARTBEAT_STALE_MS });
      }
      if (user.autoMiningSecondsBalance < CLAIM_REQUIRED_SECONDS) {
        const secondsShort = CLAIM_REQUIRED_SECONDS - user.autoMiningSecondsBalance;
        throw notReadyError("PRESENCE_INSUFFICIENT", { secondsShort, retryAfterMs: secondsShort * 1000 });
      }
    }

    const dailyUsed = await sumDailyGrantedHash(userId, now, tx);
    const amount = hashRateForMode(MINING_MODES.NORMAL);
    if (!canGrantDaily(dailyUsed, amount)) {
      const err = new Error("DAILY_LIMIT") as Error & { code: string };
      err.code = "DAILY_LIMIT";
      throw err;
    }

    const nextAt = nextClaimAfterSuccess(now);
    const bumped = await tx.autoMiningV2Session.updateMany({
      where: { id: session.id, nextClaimAt: session.nextClaimAt, isActive: true },
      data: { nextClaimAt: nextAt },
    });
    if (bumped.count !== 1) {
      const err = new Error("CONCURRENT_CLAIM") as Error & { code: string };
      err.code = "CONCURRENT_CLAIM";
      throw err;
    }

    const { expiresAt } = await resolveRewardExpiresAtForGrant(tx, userId, now);
    if (boosted) {
      // Soft debit — throttled heartbeats may leave the balance short; boost already paid.
      if (user && user.autoMiningSecondsBalance > 0) {
        const debit = Math.min(CLAIM_SECONDS_COST, user.autoMiningSecondsBalance);
        await tx.user.updateMany({
          where: { id: userId, autoMiningSecondsBalance: { gte: debit } },
          data: { autoMiningSecondsBalance: { decrement: debit } },
        });
      }
    } else {
      const debited = await tx.user.updateMany({
        where: { id: userId, autoMiningSecondsBalance: { gte: CLAIM_SECONDS_COST } },
        data: { autoMiningSecondsBalance: { decrement: CLAIM_SECONDS_COST } },
      });
      if (debited.count === 0) {
        const err = new Error("CLAIM_NOT_DUE") as Error & { code: string };
        err.code = "CLAIM_NOT_DUE";
        throw err;
      }
    }
    const grant = await tx.autoMiningV2PowerGrant.create({
      data: {
        userId,
        sessionId: session.id,
        hashRate: amount,
        mode: MINING_MODES.NORMAL,
        earnedAt: now,
        expiresAt,
      },
    });

    return { grant, nextClaimAt: nextAt };
  });

  void recordTournamentAction({
    userId,
    provider: TOURNAMENT_ACTION_PROVIDER.AUTO_MINING,
    actionCount: 1,
    executedAtUTC: now,
    providerEventId: `am:v2:${result.grant.id}`,
    metadata: { mode: MINING_MODES.NORMAL, grantId: result.grant.id },
  }).catch((err) => log.warn("tournament.action.failed", { userId, error: String(err) }));

  return result;
}

export async function getOrCreateBannerImpression(userId: number) {
  await assertV2SchemaOrThrow();
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const session = await tx.autoMiningV2Session.findFirst({ where: { userId, isActive: true } });
    if (!session) {
      const err = new Error("NO_SESSION") as Error & { code: string };
      err.code = "NO_SESSION";
      throw err;
    }
    if (session.mode !== MINING_MODES.TURBO) {
      const err = new Error("WRONG_MODE") as Error & { code: string };
      err.code = "WRONG_MODE";
      throw err;
    }
    if (session.pausedAt) {
      // Frozen because the user is away. The client shows a Resume button; nothing accrues.
      throw notReadyError("SESSION_PAUSED", {});
    }
    if (!isClaimDue(session.nextClaimAt, now)) {
      const err = new Error("CLAIM_NOT_DUE") as Error & { code: string };
      err.code = "CLAIM_NOT_DUE";
      throw err;
    }

    const dailyUsed = await sumDailyGrantedHash(userId, now, tx);
    const turboAmount = hashRateForMode(MINING_MODES.TURBO);
    if (!canGrantDaily(dailyUsed, turboAmount)) {
      const err = new Error("DAILY_LIMIT") as Error & { code: string };
      err.code = "DAILY_LIMIT";
      throw err;
    }

    const graceStart = new Date(now.getTime() - CLICK_GRACE_MS);
    const existing = await tx.autoMiningV2BannerImpression.findFirst({
      where: { userId, sessionId: session.id, grantId: null, createdAt: { gte: graceStart } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { impression: existing, reused: true };

    const picked = await pickPartnerBanner(tx);
    const impression = await tx.autoMiningV2BannerImpression.create({
      data: {
        userId,
        sessionId: session.id,
        bannerKey: picked.bannerKey,
        targetUrl: picked.targetUrl,
        title: picked.title,
        imageUrl: picked.imageUrl,
      },
    });
    return { impression, reused: false };
  });
}

export async function registerBannerClick(userId: number, impressionId: string) {
  await assertV2SchemaOrThrow();
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const imp = await tx.autoMiningV2BannerImpression.findFirst({ where: { id: impressionId, userId } });
    if (!imp) {
      const err = new Error("NOT_FOUND") as Error & { code: string };
      err.code = "NOT_FOUND";
      throw err;
    }
    if (imp.grantId != null) {
      const err = new Error("ALREADY_CLAIMED") as Error & { code: string };
      err.code = "ALREADY_CLAIMED";
      throw err;
    }
    if (imp.clickedAt) return imp;
    if (now.getTime() - imp.createdAt.getTime() < MIN_CLICK_DELAY_MS) {
      const err = new Error("CLICK_TOO_FAST") as Error & { code: string };
      err.code = "CLICK_TOO_FAST";
      throw err;
    }
    if (now.getTime() - imp.createdAt.getTime() > CLICK_GRACE_MS) {
      const err = new Error("IMPRESSION_EXPIRED") as Error & { code: string };
      err.code = "IMPRESSION_EXPIRED";
      throw err;
    }

    return tx.autoMiningV2BannerImpression.update({
      where: { id: imp.id },
      data: { clickedAt: now },
    });
  });
}

export async function claimTurbo(userId: number, impressionId: string) {
  await assertV2SchemaOrThrow();
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.autoMiningV2Session.findFirst({ where: { userId, isActive: true } });
    if (!session) {
      const err = new Error("NO_SESSION") as Error & { code: string };
      err.code = "NO_SESSION";
      throw err;
    }
    if (session.mode !== MINING_MODES.TURBO) {
      const err = new Error("WRONG_MODE") as Error & { code: string };
      err.code = "WRONG_MODE";
      throw err;
    }

    const impression = await tx.autoMiningV2BannerImpression.findFirst({
      where: { id: impressionId, userId, sessionId: session.id },
    });
    if (!impression) {
      const err = new Error("NOT_FOUND") as Error & { code: string };
      err.code = "NOT_FOUND";
      throw err;
    }

    const v = validateImpressionForTurboClaim(impression, now);
    if (!v.ok) {
      const err = new Error(v.code) as Error & { code: string };
      err.code = v.code;
      throw err;
    }

    if (session.pausedAt) {
      // Frozen because the user is away. The client shows a Resume button; nothing accrues.
      throw notReadyError("SESSION_PAUSED", {});
    }
    if (!isClaimDue(session.nextClaimAt, now)) {
      throw notReadyError("CLAIM_NOT_DUE", {
        retryAfterMs: Math.max(0, session.nextClaimAt.getTime() - now.getTime()),
      });
    }

    const user = await getUserPresence(userId, tx);
    // Split what a single boolean used to collapse, so the client can tell the user whether
    // presence went stale or they are merely short on watch time.
    if (!user || isHeartbeatStale(user.lastHeartbeatAt, now)) {
      // Without a retry hint the client's 1s poll keeps hammering: the claim route allows 12/min
      // and users were burning half their budget on 429s while presence caught up.
      throw notReadyError("PRESENCE_STALE", { retryAfterMs: HEARTBEAT_STALE_MS });
    }
    if (user.autoMiningSecondsBalance < CLAIM_REQUIRED_SECONDS) {
      const secondsShort = CLAIM_REQUIRED_SECONDS - user.autoMiningSecondsBalance;
      throw notReadyError("PRESENCE_INSUFFICIENT", { secondsShort, retryAfterMs: secondsShort * 1000 });
    }

    const dailyUsed = await sumDailyGrantedHash(userId, now, tx);
    const amount = hashRateForMode(MINING_MODES.TURBO);
    if (!canGrantDaily(dailyUsed, amount)) {
      const err = new Error("DAILY_LIMIT") as Error & { code: string };
      err.code = "DAILY_LIMIT";
      throw err;
    }

    const nextAt = nextClaimAfterSuccess(now);
    const bumped = await tx.autoMiningV2Session.updateMany({
      where: { id: session.id, nextClaimAt: session.nextClaimAt, isActive: true },
      data: { nextClaimAt: nextAt },
    });
    if (bumped.count !== 1) {
      const err = new Error("CONCURRENT_CLAIM") as Error & { code: string };
      err.code = "CONCURRENT_CLAIM";
      throw err;
    }

    const { expiresAt } = await resolveRewardExpiresAtForGrant(tx, userId, now);
    const debited = await tx.user.updateMany({
      where: { id: userId, autoMiningSecondsBalance: { gte: CLAIM_SECONDS_COST } },
      data: { autoMiningSecondsBalance: { decrement: CLAIM_SECONDS_COST } },
    });
    if (debited.count === 0) {
      const err = new Error("CLAIM_NOT_DUE") as Error & { code: string };
      err.code = "CLAIM_NOT_DUE";
      throw err;
    }
    const grant = await tx.autoMiningV2PowerGrant.create({
      data: {
        userId,
        sessionId: session.id,
        hashRate: amount,
        mode: MINING_MODES.TURBO,
        earnedAt: now,
        expiresAt,
      },
    });

    await tx.autoMiningV2BannerImpression.update({
      where: { id: impression.id },
      data: { grantId: grant.id },
    });

    return { grant, nextClaimAt: nextAt };
  });

  void recordTournamentAction({
    userId,
    provider: TOURNAMENT_ACTION_PROVIDER.AUTO_MINING,
    actionCount: 1,
    executedAtUTC: now,
    providerEventId: `am:v2:${result.grant.id}`,
    metadata: { mode: MINING_MODES.TURBO, grantId: result.grant.id, impressionId },
  }).catch((err) => log.warn("tournament.action.failed", { userId, error: String(err) }));

  return result;
}

/** Called by the future cron integration pass — deletes turbo banner impressions that were
 *  never claimed and are older than 7 days. Kept in the service module, exported through
 *  index.ts, matching legacy's cleanupStaleAutoMiningV2Impressions(). */
export async function cleanupStaleAutoMiningV2Impressions(): Promise<number> {
  if (!(await isAutoMiningV2SchemaAvailable())) return 0;
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const r = await prisma.autoMiningV2BannerImpression.deleteMany({
    where: { grantId: null, createdAt: { lt: cutoff } },
  });
  return r.count;
}

/** Called by the future cron integration pass — mirrors
 *  legacy/server/cron/autoMiningSessionCleanupCron.ts's deactivateStaleAutoMiningSessions().
 *  A session is only touched while the user is actually claiming; anything older than
 *  staleMs belongs to a closed tab and must be swept so it stops reporting as "active". */
export async function deactivateStaleAutoMiningSessions(staleMs = 30 * 60 * 1000): Promise<number> {
  if (!(await isAutoMiningV2SchemaAvailable())) return 0;
  const cutoff = new Date(Date.now() - staleMs);
  const result = await prisma.autoMiningV2Session.updateMany({
    where: { isActive: true, updatedAt: { lt: cutoff } },
    data: { isActive: false },
  });
  return result.count;
}
