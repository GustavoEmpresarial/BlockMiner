/**
 * Ported from legacy/server/modules/youtube/application/youtube.service.ts.
 *
 * Deviation from legacy: legacy's claim handler also called `getMiningEngine()` to push the
 * new hash rate into the live tick-based mining engine and emit a socket event. current/ does
 * not have that in-memory mining runtime hook wired for acquisition modules yet — same
 * documented deviation as partner-games/internal-offerwall/rooms/mini-pass/burn-events
 * (`syncUserBaseHashRate` only, no live engine reload / socket emit).
 *
 * As of Fase 10d, `notifyDailyTaskYoutubeWatch` IS wired for real — the tasks/ module was
 * ported (see current/docs/PROGRESSO.txt entry 10d); fired best-effort after a successful claim,
 * keyed by the new youtubeWatchHistory row id (same dedupe shape as legacy).
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { syncUserBaseHashRate } from "../mining/index.js";
import { notifyDailyTaskYoutubeWatch } from "../tasks/index.js";
import { recordTournamentAction, TOURNAMENT_ACTION_PROVIDER } from "../tournaments/index.js";
import { resolveRewardExpiresAtForGrant, formatRewardDurationPt, getRewardDurationMs } from "../boosts/index.js";
import { utcDayDailyResetMeta, startOfUtcCalendarDay, endOfUtcCalendarDay } from "./youtube.domain.js";
import {
  DAILY_LIMIT_HASH,
  MAX_DAILY_CLAIM_MINUTES,
  MIN_SECONDS_TO_CLAIM,
  REWARD_PER_CLAIM,
  getYtSecondsBalance,
  claimRewardTx,
  findActivePowers,
  getAggregateStats,
  getClaimsBetween,
  YoutubeClaimError,
} from "./youtube.repository.js";
import type { YoutubeClaimResult, YoutubeStatsResult, YoutubeStatusResult } from "./youtube.types.js";

const log = logger.child("youtube.service");

export async function getStatusForUser(userId: number): Promise<YoutubeStatusResult> {
  const now = new Date();
  const activePowers = await findActivePowers(userId, now);
  const activeHashRate = activePowers.reduce((sum, p) => sum + (p.hashRate || 0), 0);
  const ttlMs = await getRewardDurationMs(userId, "youtube");
  return {
    ok: true,
    activeHashRate,
    count: activePowers.length,
    rewardGh: REWARD_PER_CLAIM,
    durationMin: Math.round(ttlMs / 60_000),
  };
}

export async function getStatsForUser(userId: number): Promise<YoutubeStatsResult> {
  const now = new Date();
  const dayStart = startOfUtcCalendarDay(now);
  const dayEnd = endOfUtcCalendarDay(now);

  const [claimsToday, aggregate, balanceRow, activePowers] = await Promise.all([
    getClaimsBetween(userId, dayStart, dayEnd),
    getAggregateStats(userId),
    getYtSecondsBalance(userId),
    findActivePowers(userId, now),
  ]);

  const hashToday = claimsToday.reduce((sum, c) => sum + (c.hashRate || 0), 0);
  const claimsCountToday = claimsToday.length;
  const activeHashTotal = activePowers.reduce((sum, p) => sum + (p.hashRate || 0), 0);

  return {
    ok: true,
    claims24h: claimsCountToday,
    hashGranted24h: hashToday,
    claimsTotal: aggregate._count,
    hashGrantedTotal: Number(aggregate._sum.hashRate || 0),
    dailyLimit: DAILY_LIMIT_HASH,
    dailyRemainingHash: Math.max(0, DAILY_LIMIT_HASH - hashToday),
    dailyLimitMinutes: MAX_DAILY_CLAIM_MINUTES,
    dailyMinutesUsed: claimsCountToday,
    dailyRemainingMinutes: Math.max(0, MAX_DAILY_CLAIM_MINUTES - claimsCountToday),
    activeHashTotal,
    dailyReset: utcDayDailyResetMeta(now),
    watchSecondsBalance: balanceRow?.ytSecondsBalance ?? 0,
    minSecondsToClaim: MIN_SECONDS_TO_CLAIM,
  };
}

export async function claimForUser(userId: number, videoId: string): Promise<YoutubeClaimResult> {
  const now = new Date();
  const dayStart = startOfUtcCalendarDay(now);
  const dayEnd = endOfUtcCalendarDay(now);

  const [claimsToday, balanceRow] = await Promise.all([
    getClaimsBetween(userId, dayStart, dayEnd),
    getYtSecondsBalance(userId),
  ]);

  const watchSeconds = balanceRow?.ytSecondsBalance ?? 0;
  if (watchSeconds < MIN_SECONDS_TO_CLAIM) {
    const retryAfterMs = Math.max(0, (MIN_SECONDS_TO_CLAIM - watchSeconds) * 1000);
    return { ok: false, status: 400, retryAfterMs, message: "Tempo de visualização insuficiente verificado pelo servidor." };
  }

  const currentDailyHash = claimsToday.reduce((sum, c) => sum + (c.hashRate || 0), 0);
  const claimsCountToday = claimsToday.length;

  // MODELO 4: O limite de hashrate diário continua travado em 1.000 H/s (proteção econômica).
  // Porém, acima do teto o usuário continua assistindo e recebendo +1 ponto no torneio (+1 pt/claim),
  // com hashrate concedido = 0.
  const isHashrateCapped = currentDailyHash >= DAILY_LIMIT_HASH;
  const hashRateToGrant = isHashrateCapped ? 0 : REWARD_PER_CLAIM;

  let claimTtlMs = 0;
  let watchHistoryId: number | null = null;
  try {
    const hist = await prisma.$transaction(
      async (tx) => {
        const { expiresAt, durationMs } = await resolveRewardExpiresAtForGrant(tx, userId, now, "youtube");
        claimTtlMs = durationMs;
        return claimRewardTx(tx, userId, videoId, now, expiresAt, hashRateToGrant);
      },
      { maxWait: 10_000, timeout: 20_000 },
    );
    watchHistoryId = hist.id;
  } catch (err: unknown) {
    if (err instanceof YoutubeClaimError && err.code === "INSUFFICIENT_BALANCE") {
      return {
        ok: false,
        status: 400,
        retryAfterMs: 10_000,
        message: "Tempo de visualização insuficiente verificado pelo servidor.",
      };
    }
    log.error("YT claim transaction failed", { error: err instanceof Error ? err.message : String(err), userId, videoId });
    return { ok: false, status: 500, message: "Erro interno ao processar recompensa." };
  }

  if (hashRateToGrant > 0) {
    await syncUserBaseHashRate(userId).catch((err) => {
      log.warn("youtube.claim.sync_hashrate_failed", { userId, error: String(err) });
    });
  }

  if (watchHistoryId != null) {
    await notifyDailyTaskYoutubeWatch(userId, watchHistoryId).catch((err) => {
      log.warn("youtube.claim.daily_task_hook_failed", { userId, error: String(err) });
    });

    void recordTournamentAction({
      userId,
      provider: TOURNAMENT_ACTION_PROVIDER.YOUTUBE,
      actionCount: 1,
      executedAtUTC: now,
      providerEventId: `yt:${watchHistoryId}`,
      metadata: { videoId, watchHistoryId, hashRate: hashRateToGrant, tournamentOnly: isHashrateCapped },
    }).catch((err) => {
      log.warn("youtube.claim.tournament_action_failed", { userId, error: String(err) });
    });
  }

  if (isHashrateCapped) {
    return {
      ok: true,
      rewardGh: 0,
      message: "+1 ponto de torneio registrado! (Limite diário de 1.000 H/s atingido)",
    };
  }

  return {
    ok: true,
    rewardGh: REWARD_PER_CLAIM,
    message: `+${REWARD_PER_CLAIM} H/s ativado por ${formatRewardDurationPt(claimTtlMs)}!`,
  };
}
