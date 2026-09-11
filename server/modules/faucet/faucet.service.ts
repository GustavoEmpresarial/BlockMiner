/**
 * Ported from legacy/server/modules/faucet/faucet.service.ts.
 *
 * Cross-module notes:
 * - Reuses shared/calendar/utcCalendar.ts (getUtcDayKey) — same file game2048/checkin
 *   already use. Site-wide UTC 00:00 day boundary, explicit product decision.
 * - Reuses boosts/'s public `resolveRewardExpiresAtForGrant`/`formatRewardDurationPt`/
 *   `rewardDurationHoursFromMs` (ported in Fase 3, exported via boosts/index.ts) instead
 *   of duplicating power-boost reward-duration math.
 * - Always grants temporary power (`userPowerGame`). Catalog miner is display +
 *   hashRate only — never a permanent inventory machine. TTL is 24h, or 7 days
 *   when today's Power Boost is active (`resolveRewardExpiresAtForGrant`).
 *
 * Deviation (documented): legacy's `getActiveReward()` synthesizes a hardcoded "fake
 * miner" object (id 999999, "Faucet Boost 10 H/s") when no real FaucetReward row
 * exists in the DB yet, so the faucet always has *something* to hand out even before
 * an admin configures a real reward. Ported as-is — this is real legacy behavior, not
 * new logic invented here.
 */
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import prisma from "../../core/database/prisma.js";
import { getUtcDayKey } from "../../shared/calendar/utcCalendar.js";
import { resolveRewardExpiresAtForGrant, getRewardDurationMs, formatRewardDurationPt, rewardDurationHoursFromMs } from "../boosts/index.js";
import { logger } from "../../core/logger/index.js";
import { FAUCET_ERROR } from "./faucet.errors.js";
import { buildNoRewardStatusResponse, buildStatusCore, mapPublicReward } from "./faucet.dto.js";
import type { FaucetPartnerState, FaucetRewardInfo } from "./faucet.types.js";
import * as faucetRepository from "./faucet.repository.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";

const log = logger.child("faucet.service");

const TEMP_POWER_FALLBACK_TTL_MS = 86_400_000; // 24h — display-only fallback, see header.
export const DEFAULT_FAUCET_COOLDOWN_MS = 60 * 60 * 1000;
export const FAUCET_PARTNER_WAIT_MS = 10_000;
const TEMP_POWER_FAKE_MINER_ID = 999999;

export async function getActiveReward(): Promise<FaucetRewardInfo | null> {
  const reward = await faucetRepository.findActiveFaucetReward();
  const now = new Date();
  const fakeMiner = {
    id: TEMP_POWER_FAKE_MINER_ID,
    name: "Faucet Boost 10 H/s",
    baseHashRate: 10,
    slotSize: 0,
    imageUrl: "/media/miners/reward1.webp",
    isActive: true,
    price: new Prisma.Decimal(0),
    createdAt: now,
    updatedAt: now,
  } as Awaited<ReturnType<typeof faucetRepository.findActiveFaucetReward>> extends infer M
    ? M extends { miner: infer Mi }
      ? Mi
      : never
    : never;

  return { rewardId: reward?.id || 1, cooldownMs: reward?.cooldownMs || DEFAULT_FAUCET_COOLDOWN_MS, miner: reward?.miner ?? fakeMiner };
}

export async function normalizeFaucetRecord(userId: number, record: Awaited<ReturnType<typeof faucetRepository.findFaucetClaimByUserId>>) {
  const todayKey = getUtcDayKey();
  if (!record) return { record: null, todayKey };
  if (record.dayKey === todayKey) return { record, todayKey };
  const updated = await faucetRepository.resetFaucetClaimDayKey(userId, todayKey);
  return { record: updated, todayKey };
}

export function computePartnerState(
  record: { claimedAt: Date | null } | null,
  visit: { openedAt: Date | null; eligibleAt: Date | null } | null,
  now: Date,
): FaucetPartnerState {
  const lastClaimAt = record?.claimedAt?.getTime() || 0;
  const visitOpenedAt = visit?.openedAt?.getTime() || 0;
  const visitEligibleAt = visit?.eligibleAt?.getTime() || 0;
  const hasFreshVisit = visitOpenedAt > 0 && visitOpenedAt > lastClaimAt;
  const waitRemainingMs = hasFreshVisit ? Math.max(0, visitEligibleAt - now.getTime()) : 0;
  const partnerReady = hasFreshVisit && waitRemainingMs === 0;
  return { hasFreshVisit, waitRemainingMs, partnerReady };
}

export async function startPartnerVisitForUser(userId: number) {
  const now = new Date();
  const todayKey = getUtcDayKey();
  const eligibleAt = new Date(now.getTime() + FAUCET_PARTNER_WAIT_MS);
  await faucetRepository.upsertFaucetPartnerVisit(userId, todayKey, now, eligibleAt);
  return { ok: true as const, waitMs: FAUCET_PARTNER_WAIT_MS, eligibleAt: eligibleAt.getTime() };
}

export async function getStatusForUser(userId: number) {
  const record = await faucetRepository.findFaucetClaimByUserId(userId);
  const reward = await getActiveReward();
  if (!reward) return buildNoRewardStatusResponse();

  const normalized = await normalizeFaucetRecord(userId, record);
  const now = new Date();
  const payload = buildStatusCore(normalized.record, now, reward.cooldownMs);
  const visit = await faucetRepository.findFaucetPartnerVisitLatest(userId);
  const partner = computePartnerState(normalized.record, visit, now);
  const durationMs = await getRewardDurationMs(userId, "faucet");
  const rewardDurationHours = rewardDurationHoursFromMs(durationMs);

  return {
    ok: true as const,
    ...payload,
    canClaim: Boolean(payload.available && partner.partnerReady),
    partnerReady: partner.partnerReady,
    partnerVisitActive: partner.hasFreshVisit,
    partnerWaitRemainingMs: partner.waitRemainingMs,
    reward: mapPublicReward(reward, rewardDurationHours),
  };
}

export type FaucetClaimResult =
  | { ok: true; message: string; nextAvailableAt: number }
  | { ok: false; code: string; status: number; message: string; remainingMs?: number };

export async function claimForUser(userId: number, _req: Request): Promise<FaucetClaimResult> {
  const now = new Date();
  const reward = await getActiveReward();
  if (!reward) {
    return { ok: false, code: FAUCET_ERROR.REWARD_NOT_CONFIGURED, status: 500, message: "Faucet reward not configured." };
  }

  const record = await faucetRepository.findFaucetClaimByUserId(userId);
  const normalized = await normalizeFaucetRecord(userId, record);
  const status = buildStatusCore(normalized.record, now, reward.cooldownMs);
  if (!status.available) {
    return { ok: false, code: FAUCET_ERROR.COOLDOWN_ACTIVE, status: 429, message: "Cooldown active.", remainingMs: status.remainingMs };
  }

  const visit = await faucetRepository.findFaucetPartnerVisitLatest(userId);
  const partner = computePartnerState(normalized.record, visit, now);
  if (!partner.partnerReady) {
    return { ok: false, code: FAUCET_ERROR.PARTNER_INCOMPLETE, status: 403, message: "Visita ao parceiro incompleta ou tempo mínimo não atingido." };
  }

  const miner = reward.miner;
  let faucetRewardTtlMs: number | null = null;

  await prisma.$transaction(async (tx) => {
    const slug = "faucet_power";
    const game = await tx.game.upsert({
      where: { slug },
      create: { name: "Faucet Temporary Boost", slug, isActive: true },
      update: {},
    });
    const playedAt = now;
    const { expiresAt, durationMs } = await resolveRewardExpiresAtForGrant(tx, userId, playedAt, "faucet");
    faucetRewardTtlMs = durationMs;
    await tx.userPowerGame.create({
      data: { userId, gameId: game.id, hashRate: miner.baseHashRate, playedAt, expiresAt },
    });

    await tx.faucetClaim.upsert({
      where: { userId },
      update: { claimedAt: now, totalClaims: { increment: 1 }, dayKey: normalized.todayKey },
      create: { userId, claimedAt: now, totalClaims: 1, dayKey: normalized.todayKey },
    });
  });

  const ttlMs = faucetRewardTtlMs ?? TEMP_POWER_FALLBACK_TTL_MS;
  const durationLabel = formatRewardDurationPt(ttlMs);
  log.info("Faucet temporary power reward created", {
    userId,
    minerId: miner.id,
    minerName: miner.name,
    hashRate: miner.baseHashRate,
    durationHours: rewardDurationHoursFromMs(ttlMs),
  });

  void recordTournamentAction({
    userId,
    provider: TOURNAMENT_ACTION_PROVIDER.FAUCET,
    actionCount: 1,
    executedAtUTC: now,
    providerEventId: `faucet:${userId}:${normalized.todayKey}:${now.toISOString()}`,
    metadata: { dayKey: normalized.todayKey, minerId: miner.id },
  }).catch((err) => log.warn("tournament.action.failed", { userId, error: String(err) }));

  return {
    ok: true,
    message: `Sucesso! Poder de mineração temporário de ${miner.baseHashRate} H/s ativado por ${durationLabel}.`,
    nextAvailableAt: now.getTime() + reward.cooldownMs,
  };
}
