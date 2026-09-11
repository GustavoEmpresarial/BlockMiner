/**
 * Ported from legacy/server/modules/ptc/application/ptc.service.ts. Full PTP
 * (paid-to-click) two-sided marketplace: users create ad campaigns (SHIB debited on
 * creation, inside a single `prisma.$transaction`, same direct
 * `tx.user.update({ data: { shibBalance: { increment/decrement } } })` pattern as
 * current/server/modules/shop/shop.service.ts — no separate creditWallet() export
 * exists) and users view other users' ads to earn SHIB (session-based: open -> heartbeat
 * -> complete -> claim, capped by targetViews, one reward per ad per viewer via
 * PtpView's unique [adId, viewerHash] constraint).
 *
 * SHIB wallet support: current/'s User model already has `shibBalance` (Decimal(30,8)),
 * confirmed at current/prisma/schema.prisma:41 — same field legacy used. No gap here;
 * balance mutations below are real, not stubbed.
 *
 * UTC-vs-BRT dedup decision: legacy's own domain/ptc.utc.ts was ALREADY 100% UTC-based
 * (getUtcCalendarDate/getNextUtcResetAt/wasViewedOnUtcDate — no America/Sao_Paulo logic
 * anywhere in legacy ptc/). So the "abandon BRT for UTC" site-wide decision documented in
 * PROGRESSO.txt section 9 does not apply here as a *behavior change* — ptc/ never had BRT
 * logic to replace. What changed is only *where* the UTC day-key math lives: legacy kept a
 * private copy in ptc/domain/ptc.utc.ts, current/ reuses the shared
 * server/shared/calendar/utcCalendar.ts (getUtcDayKey/isSameUtcDay) that
 * checkin/energy-tax/faucet/games already share, avoiding a 4th duplicate implementation.
 * See ptc.repository.ts's `wasViewedOnUtcDay` for the 1:1 behavioral port.
 *
 * Anti-cheat preserved: HEARTBEAT_MAX_GAP_MS (15s) caps how much wall-clock time a single
 * heartbeat can credit toward accumulatedMs, so a delayed/batched heartbeat can't fabricate
 * long viewing time. SESSION_STALE_MS (90s) auto-cancels a session with no heartbeat in that
 * window. SESSION_CLAIM_WINDOW_MS (2h) caps how long a `completed` session can sit unclaimed
 * before being auto-cancelled. Viewing your own ad is blocked (`ad.userId === userId`).
 * viewerHash = `user_${userId}` + PtpView's unique [adId, viewerHash] hard-constrains one
 * paid view per ad per viewer per day, race-safe via the upsert in `recordView`.
 *
 * Ad approval flow preserved: campaigns are created `pending_approval`, only an admin
 * (ptc.admin.routes.ts, requireAdminAuth) can move them to `active` or `rejected`
 * (with pro-rata refund of undelivered views). views hitting targetViews auto-completes
 * the ad inside the same claim transaction (no separate cron/sweep needed).
 *
 * Tournament hook: grepped legacy/server/ broadly for recordTournamentAction /
 * TOURNAMENT_ACTION_PROVIDER from ptc/ — none found. No TODO needed here.
 */
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import * as repo from "./ptc.repository.js";
import { logger } from "../../core/logger/index.js";
import { getUtcDayKey, getUtcPeriodResetAt } from "../../shared/calendar/utcCalendar.js";
import { PTC_ERROR_MESSAGE } from "./ptc.errors.js";
import {
  SESSION_STALE_MS,
  SESSION_CLAIM_WINDOW_MS,
  HEARTBEAT_MAX_GAP_MS,
  type PtpSessionOpenRow,
  type CreateCampaignInput,
  type EditCampaignInput,
  type UpdateSettingsInput,
  type CreateTierInput,
  type UpdateTierInput,
} from "./ptc.types.js";

const Decimal = Prisma.Decimal;
const log = logger.child("ptc.service");

// ── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings() {
  return repo.getSettings();
}

export async function updateSettings(data: UpdateSettingsInput) {
  return repo.updateSettings(data);
}

// ── Ad Tiers ─────────────────────────────────────────────────────────────────

export async function getTiers() {
  return repo.getTiers();
}

export async function getActiveTiers() {
  return repo.getActiveTiers();
}

export async function createTier(data: CreateTierInput) {
  return repo.createTier({
    label: data.label,
    adType: data.adType ?? "window",
    durationSeconds: data.durationSeconds,
    pricePerViewShib: data.pricePerViewShib,
    rewardPerViewShib: data.rewardPerViewShib,
    isActive: data.isActive ?? true,
    sortOrder: data.sortOrder ?? 0,
  });
}

export async function updateTier(id: number, data: UpdateTierInput) {
  return repo.updateTier(id, data);
}

export async function deleteTier(id: number) {
  const tier = await repo.getTierById(id);
  if (!tier) throw new Error(PTC_ERROR_MESSAGE.TIER_NOT_FOUND);
  return repo.deleteTier(id);
}

// ── Campaign creation ─────────────────────────────────────────────────────────

export async function createCampaign(userId: number, input: CreateCampaignInput) {
  const settings = await repo.getSettings();
  if (!settings.isEnabled) throw new Error(PTC_ERROR_MESSAGE.DISABLED);

  const tier = await repo.getTierById(input.tierId);
  if (!tier || !tier.isActive) throw new Error(PTC_ERROR_MESSAGE.TIER_UNAVAILABLE);

  const { minViews, maxViews } = settings;
  if (input.targetViews < minViews || input.targetViews > maxViews) {
    throw new Error(`Views must be between ${minViews} and ${maxViews}`);
  }

  const pricePerView = new Decimal(tier.pricePerViewShib.toString());
  const costShib = pricePerView.mul(input.targetViews);
  const rewardPerViewShib = new Decimal(tier.rewardPerViewShib.toString());

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error(PTC_ERROR_MESSAGE.USER_NOT_FOUND);

    if (new Decimal(user.shibBalance.toString()).lt(costShib)) {
      throw new Error(PTC_ERROR_MESSAGE.INSUFFICIENT_BALANCE);
    }

    await tx.user.update({ where: { id: userId }, data: { shibBalance: { decrement: costShib } } });

    const hash = randomHash();
    await tx.ptpAd.create({
      data: {
        userId,
        tierId: tier.id,
        title: input.title,
        description: input.description,
        url: input.url,
        hash,
        adType: tier.adType,
        durationSeconds: tier.durationSeconds,
        targetViews: input.targetViews,
        costShib,
        rewardPerViewShib,
        status: "pending_approval",
      },
    });
  });
}

function randomHash(): string {
  return crypto.randomBytes(8).toString("hex");
}

// ── Campaign management (user) ────────────────────────────────────────────────

export async function editCampaign(userId: number, adId: number, data: EditCampaignInput) {
  const ad = await repo.getCampaignById(adId);
  if (!ad || ad.userId !== userId) throw new Error(PTC_ERROR_MESSAGE.CAMPAIGN_NOT_FOUND);
  if (ad.status === "completed" || ad.status === "rejected") {
    throw new Error(PTC_ERROR_MESSAGE.CAMPAIGN_LOCKED);
  }

  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.active !== undefined) {
    if (ad.status === "active" && !data.active) updateData.status = "paused";
    if (ad.status === "paused" && data.active) updateData.status = "active";
  }

  return repo.updateCampaign(adId, updateData);
}

export async function addViews(userId: number, adId: number, extraViews: number) {
  const settings = await repo.getSettings();
  const ad = await repo.getCampaignById(adId);
  if (!ad || ad.userId !== userId) throw new Error(PTC_ERROR_MESSAGE.CAMPAIGN_NOT_FOUND);
  if (ad.status === "completed" || ad.status === "rejected") {
    throw new Error(PTC_ERROR_MESSAGE.CAMPAIGN_LOCKED_VIEWS_ADD);
  }

  const newTotal = ad.targetViews + extraViews;
  if (newTotal > settings.maxViews) throw new Error(`Max views is ${settings.maxViews}`);

  let pricePerView: InstanceType<typeof Decimal>;
  if (ad.tierId) {
    const tier = await repo.getTierById(ad.tierId);
    pricePerView = new Decimal(tier ? tier.pricePerViewShib.toString() : ad.costShib.toString()).div(
      ad.targetViews || 1,
    );
  } else {
    pricePerView =
      ad.targetViews > 0
        ? new Decimal(ad.costShib.toString()).div(ad.targetViews)
        : new Decimal(settings.pricePerViewShib.toString());
  }
  const costShib = pricePerView.mul(extraViews);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error(PTC_ERROR_MESSAGE.USER_NOT_FOUND);
    if (new Decimal(user.shibBalance.toString()).lt(costShib)) {
      throw new Error(PTC_ERROR_MESSAGE.INSUFFICIENT_BALANCE);
    }

    await tx.user.update({ where: { id: userId }, data: { shibBalance: { decrement: costShib } } });
    await tx.ptpAd.update({
      where: { id: adId },
      data: { targetViews: { increment: extraViews }, costShib: { increment: costShib } },
    });
  });
}

export async function removeViews(userId: number, adId: number, reduceViews: number) {
  const settings = await repo.getSettings();
  const ad = await repo.getCampaignById(adId);
  if (!ad || ad.userId !== userId) throw new Error(PTC_ERROR_MESSAGE.CAMPAIGN_NOT_FOUND);
  if (ad.status === "completed" || ad.status === "rejected") {
    throw new Error(PTC_ERROR_MESSAGE.CAMPAIGN_LOCKED_VIEWS_REMOVE);
  }

  const minAfterReduction = ad.views;
  const newTarget = ad.targetViews - reduceViews;
  if (newTarget < minAfterReduction) {
    throw new Error(`Cannot reduce below delivered views (${minAfterReduction})`);
  }
  if (newTarget < settings.minViews) throw new Error(`Min views is ${settings.minViews}`);

  const pricePerView =
    ad.targetViews > 0
      ? new Decimal(ad.costShib.toString()).div(ad.targetViews)
      : new Decimal(settings.pricePerViewShib.toString());
  const refundShib = pricePerView.mul(reduceViews);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { shibBalance: { increment: refundShib } } });
    await tx.ptpAd.update({
      where: { id: adId },
      data: { targetViews: { decrement: reduceViews }, costShib: { decrement: refundShib } },
    });
  });
}

// ── Admin approval ────────────────────────────────────────────────────────────

export async function approveCampaign(adId: number) {
  const ad = await repo.getCampaignById(adId);
  if (!ad) throw new Error(PTC_ERROR_MESSAGE.CAMPAIGN_NOT_FOUND);
  if (ad.status !== "pending_approval") throw new Error(PTC_ERROR_MESSAGE.NOT_PENDING_APPROVAL);
  return repo.updateCampaign(adId, { status: "active" });
}

export async function rejectCampaign(adId: number, reason: string) {
  const ad = await repo.getCampaignById(adId);
  if (!ad) throw new Error(PTC_ERROR_MESSAGE.CAMPAIGN_NOT_FOUND);
  if (ad.status !== "pending_approval") throw new Error(PTC_ERROR_MESSAGE.NOT_PENDING_APPROVAL);

  const undelivered = ad.targetViews - ad.views;
  const refundShib =
    ad.targetViews > 0
      ? new Decimal(ad.costShib.toString()).div(ad.targetViews).mul(undelivered)
      : new Decimal(0);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ad.userId }, data: { shibBalance: { increment: refundShib } } });
    await tx.ptpAd.update({ where: { id: adId }, data: { status: "rejected", rejectionReason: reason } });
  });
}

// ── Session-based view tracking ───────────────────────────────────────────────

export function isSessionStale(session: PtpSessionOpenRow, now: Date): boolean {
  if (session.status === "completed") {
    if (!session.completedAt) return true;
    return now.getTime() - session.completedAt.getTime() > SESSION_CLAIM_WINDOW_MS;
  }
  const ref = session.lastHeartbeatAt ?? session.startedAt;
  return now.getTime() - ref.getTime() > SESSION_STALE_MS;
}

async function cleanupStaleSessionsForUser(userId: number, now: Date = new Date()): Promise<void> {
  const sessions = await repo.listOpenSessionsForUser(userId);
  for (const session of sessions) {
    if (!isSessionStale(session, now)) continue;
    const reason = session.status === "completed" ? "claim_window_expired" : "heartbeat_timeout";
    await repo.updateSession(session.id, { status: "cancelled", cancelReason: reason });
    log.info("session_stale_cancelled", { userId, sessionId: session.id, reason });
  }
}

export async function startSession(userId: number, adId: number) {
  await cleanupStaleSessionsForUser(userId);

  const existing = await repo.getActiveSessionForUser(userId);
  if (existing) throw new Error(PTC_ERROR_MESSAGE.SESSION_ALREADY_ACTIVE);

  const ad = await repo.getCampaignById(adId);
  if (!ad || ad.status !== "active") throw new Error(PTC_ERROR_MESSAGE.AD_UNAVAILABLE);
  if (ad.userId === userId) throw new Error(PTC_ERROR_MESSAGE.CANNOT_VIEW_OWN_AD);

  const viewerHash = `user_${userId}`;
  const alreadyViewedToday = await repo.findViewBlockedForToday(adId, viewerHash);
  if (alreadyViewedToday) throw new Error(PTC_ERROR_MESSAGE.ALREADY_VIEWED_TODAY);

  const session = await repo.createSession({ userId, adId, viewerHash, requiredSeconds: ad.durationSeconds });
  log.info("session_started", { userId, adId, sessionId: session.id, requiredSeconds: ad.durationSeconds });
  return session;
}

export async function heartbeat(sessionId: string, userId: number) {
  const session = await repo.getSessionById(sessionId);
  if (!session || session.userId !== userId) throw new Error(PTC_ERROR_MESSAGE.SESSION_NOT_FOUND);

  if (session.status === "claimed") throw new Error(PTC_ERROR_MESSAGE.SESSION_ALREADY_CLAIMED);
  if (session.status === "cancelled") throw new Error(PTC_ERROR_MESSAGE.SESSION_CANCELLED);
  if (session.status === "completed") return session;

  const now = new Date();
  let deltaMs = 0;
  if (session.status === "viewing" && session.lastHeartbeatAt) {
    deltaMs = Math.min(now.getTime() - session.lastHeartbeatAt.getTime(), HEARTBEAT_MAX_GAP_MS);
  }

  const newAccumulatedMs = session.accumulatedMs + deltaMs;
  const isComplete = newAccumulatedMs / 1000 >= session.requiredSeconds;

  const updated = await repo.updateSession(sessionId, {
    status: isComplete ? "completed" : "viewing",
    accumulatedMs: newAccumulatedMs,
    lastHeartbeatAt: now,
    ...(isComplete ? { completedAt: now } : {}),
  });

  if (isComplete) log.info("session_completed", { userId, sessionId, accumulatedMs: newAccumulatedMs });
  return updated;
}

export async function pauseSession(sessionId: string, userId: number) {
  const session = await repo.getSessionById(sessionId);
  if (!session || session.userId !== userId) throw new Error(PTC_ERROR_MESSAGE.SESSION_NOT_FOUND);

  if (["completed", "cancelled", "claimed"].includes(session.status)) return session;

  const now = new Date();
  let deltaMs = 0;
  if (session.status === "viewing" && session.lastHeartbeatAt) {
    deltaMs = Math.min(now.getTime() - session.lastHeartbeatAt.getTime(), HEARTBEAT_MAX_GAP_MS);
  }

  const newAccumulatedMs = session.accumulatedMs + deltaMs;
  const isComplete = newAccumulatedMs / 1000 >= session.requiredSeconds;

  const updated = await repo.updateSession(sessionId, {
    status: isComplete ? "completed" : "paused",
    accumulatedMs: newAccumulatedMs,
    lastHeartbeatAt: now,
    ...(isComplete ? { completedAt: now } : {}),
  });

  log.info("session_paused", { userId, sessionId, accumulatedMs: newAccumulatedMs, isComplete });
  return updated;
}

export async function cancelSession(sessionId: string, userId: number, reason: string) {
  const session = await repo.getSessionById(sessionId);
  if (!session || session.userId !== userId) return;
  if (session.status === "claimed") return;

  await repo.updateSession(sessionId, { status: "cancelled", cancelReason: reason });
  log.info("session_cancelled", { userId, sessionId, reason });
}

export async function claimSession(sessionId: string, userId: number) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const session = await tx.ptpSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId) throw new Error(PTC_ERROR_MESSAGE.SESSION_NOT_FOUND);
    if (session.status === "claimed") throw new Error(PTC_ERROR_MESSAGE.SESSION_REWARD_ALREADY_CLAIMED);
    if (session.status === "cancelled") throw new Error(PTC_ERROR_MESSAGE.SESSION_CANCELLED_RESTART);

    if (session.status !== "completed") {
      if (isSessionStale(session, now)) {
        await tx.ptpSession.update({
          where: { id: sessionId },
          data: { status: "cancelled", cancelReason: "heartbeat_timeout" },
        });
        throw new Error(PTC_ERROR_MESSAGE.SESSION_EXPIRED);
      }
      throw new Error(PTC_ERROR_MESSAGE.SESSION_NOT_COMPLETE);
    }

    const alreadyViewedToday = await repo.findViewBlockedForTodayTx(tx, session.adId, session.viewerHash, now);
    if (alreadyViewedToday) {
      await tx.ptpSession.update({
        where: { id: sessionId },
        data: { status: "cancelled", cancelReason: "already_viewed" },
      });
      throw new Error(PTC_ERROR_MESSAGE.VIEW_ALREADY_RECORDED);
    }

    const ad = await tx.ptpAd.findUnique({ where: { id: session.adId } });
    if (!ad || ad.status !== "active") {
      await tx.ptpSession.update({
        where: { id: sessionId },
        data: { status: "cancelled", cancelReason: "ad_unavailable" },
      });
      throw new Error(PTC_ERROR_MESSAGE.AD_NO_LONGER_AVAILABLE);
    }

    const earnedShib = new Decimal(ad.rewardPerViewShib.toString());
    const newViews = ad.views + 1;
    const isCompleted = newViews >= ad.targetViews;

    await repo.recordView(tx, session.adId, session.viewerHash, Number(earnedShib.toString()), now);
    await tx.ptpAd.update({
      where: { id: session.adId },
      data: { views: newViews, status: isCompleted ? "completed" : "active" },
    });
    await tx.ptpEarning.create({ data: { userId, adId: session.adId, amountShib: earnedShib } });
    await tx.user.update({ where: { id: userId }, data: { shibBalance: { increment: earnedShib } } });
    await tx.ptpSession.update({ where: { id: sessionId }, data: { status: "claimed", claimedAt: now } });

    log.info("reward_claimed", { userId, sessionId, earnedShib: earnedShib.toString() });
  });
}

export async function getActiveSession(userId: number) {
  await cleanupStaleSessionsForUser(userId);
  return repo.getActiveSessionForUser(userId);
}

// ── Getters ───────────────────────────────────────────────────────────────────

export async function getMyCampaigns(userId: number) {
  return repo.getCampaignsByUser(userId);
}

export async function getAvailableAds(userId: number) {
  await cleanupStaleSessionsForUser(userId);
  const ads = await repo.getAdsForViewer(userId);
  const now = new Date();
  const dayKey = getUtcDayKey(now);
  const nextResetAt = getUtcPeriodResetAt(dayKey);
  return {
    ads,
    daily: {
      utcDate: dayKey,
      nextResetAt: nextResetAt.toISOString(),
      nextResetInMs: Math.max(0, nextResetAt.getTime() - now.getTime()),
    },
  };
}

export async function getEarningsHistory(userId: number) {
  return repo.getUserEarnings(userId, 50);
}
