/**
 * Ported from legacy/server/modules/stats/stats.controller.ts.
 *
 * The BLK cycle reward-distribution subsystem (`getBlkCyclePublicSnapshot`, backed by
 * `BlkRewardCycle`) is now ported to current/ — it lives in the mining module
 * (`mining/mining.blk-cycle.ts`) and is consumed here through the normal `mining/index.ts`
 * module boundary. `network.lastBlkCycle`, `network.blkPoolSharePercent`,
 * `network.rewardPerCycle`, `network.blkPaused`, `network.activityWindowSec` and
 * `history.blkCycles` are real Prisma-backed data, same as everything else in this
 * controller (power breakdown, machines, youtube, games, auto-mining, checkin milestones,
 * mining-log history/analytics, network rank).
 */
import type { Request, Response } from "express";
import * as statsRepo from "./stats.repository.js";
import { computeCheckinStreak } from "../checkin/index.js";
import {
  CHECKIN_BONUS_GAME_SLUG,
  aggregateUserHashrates,
  getCachedRankingRows,
} from "../tournaments/index.js";
import { isAutoMiningV2SchemaAvailable } from "../auto-mining/index.js";
import { getBlkCyclePublicSnapshot } from "../mining/index.js";
import { logger } from "../../core/logger/index.js";
import { getUserEarningsStats, parseEarningsPeriod } from "./stats.earnings.service.js";

const log = logger.child("stats.controller");

const HISTORY_LOG_DAYS = 30;
const YT_HISTORY_LIMIT = 20;
const BLK_CYCLE_HISTORY = 20;

function iso(d: unknown): string | null {
  if (d instanceof Date) return d.toISOString();
  return null;
}

function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeUserRank(
  sortedRank: Array<{ id: number; totalHashRate: number }>,
  userId: number,
): { rank: number; totalUsers: number } | null {
  const idx = sortedRank.findIndex((r) => r.id === userId);
  if (idx === -1) return null;
  return { rank: idx + 1, totalUsers: sortedRank.length };
}

/**
 * GET /api/stats/power
 * Read-only consolidated power breakdown for the authenticated user + network context.
 */
export async function getPowerStats(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ ok: false, message: "Session invalid." });
      return;
    }
    const now = new Date();
    const v2SchemaOk = await isAutoMiningV2SchemaAvailable();

    const [userRow, allMiners] = await Promise.all([
      statsRepo.findUserForPowerStats(userId),
      statsRepo.listUserMinersWithRack(userId),
    ]);

    const [gamePowers, ytPowers, gpuPowers, ytHistory] = await Promise.all([
      statsRepo.listActiveGamePowers(userId, now),
      statsRepo.listActiveYoutubePowers(userId, now),
      statsRepo.listActiveGpuPowers(userId, now),
      statsRepo.listRecentYoutubeHistory(userId, YT_HISTORY_LIMIT),
    ]);

    const [miningLogs, blkCycles, streak, activeUsers24h, sortedRank] = await Promise.all([
      statsRepo.listRecentMiningLogs(userId, Date.now() - HISTORY_LOG_DAYS * 86400000),
      statsRepo.listRecentBlkCycles(BLK_CYCLE_HISTORY),
      computeCheckinStreak(userId),
      statsRepo.countActiveUsersInWindow(Date.now() - 86400000),
      // item 91: leaderboard global agora vem do cache (stale-while-revalidate, TTL ~60s) —
      // era ~1s carregando ~400 usuários com dezenas de milhares de linhas aninhadas em
      // TODA abertura da tela. `getCachedRankingRows` já devolve a lista ORDENADA
      // (buildRankingRows aplicado dentro do cache), então não reordenamos aqui.
      getCachedRankingRows(now, v2SchemaOk).catch((rankErr: unknown) => {
        log.warn("powerStats.ranking_degraded", {
          message: rankErr instanceof Error ? rankErr.message : String(rankErr),
        });
        return [] as Awaited<ReturnType<typeof getCachedRankingRows>>;
      }),
    ]);

    const gpuV2Powers = v2SchemaOk ? await statsRepo.listActiveGpuV2Powers(userId, now) : [];

    if (!userRow) {
      res.status(404).json({ ok: false, message: "User not found." });
      return;
    }

    let checkinHashMilestones: Array<{
      dayThreshold: number;
      rewardValue: unknown;
      validityDays: number;
      displayTitle: string | null;
    }> = [];
    try {
      checkinHashMilestones = await statsRepo.listActiveCheckinHashMilestones();
    } catch (e: unknown) {
      log.warn("getPowerStats: checkin milestones unavailable", { error: String(e) });
    }

    const agg = aggregateUserHashrates(
      {
        id: userId,
        miners: allMiners.filter((m) => m.isActive),
        gamePowers,
        ytPowers,
        gpuAccess: gpuPowers,
        autoMiningV2Grants: gpuV2Powers,
      },
      { onlyActiveMiners: true },
    );

    const total = agg.totalHashrate || 0;
    const permPct = total > 0 ? (agg.permanentHashrate / total) * 100 : 0;
    const tempPct = total > 0 ? (agg.temporaryHashrate / total) * 100 : 0;

    type PowerExpirationRow = {
      source: string;
      slug: string | null;
      name: string;
      hashRate: number;
      expiresAt: string | null;
      playedAt: string | null;
    };
    const expirations: PowerExpirationRow[] = [];

    for (const g of gamePowers) {
      expirations.push({
        source: "game",
        slug: g.game?.slug || "unknown",
        name: g.game?.name || "Game",
        hashRate: Number(g.hashRate) || 0,
        expiresAt: iso(g.expiresAt),
        playedAt: iso(g.playedAt),
      });
    }
    for (const y of ytPowers) {
      expirations.push({
        source: "youtube",
        slug: null,
        name: "YouTube",
        hashRate: Number(y.hashRate) || 0,
        expiresAt: iso(y.expiresAt),
        playedAt: iso(y.claimedAt),
      });
    }
    for (const p of gpuPowers) {
      expirations.push({
        source: "auto_mining",
        slug: null,
        name: "Auto Mining GPU",
        hashRate: Number(p.gpuHashRate) || 0,
        expiresAt: iso(p.expiresAt),
        playedAt: iso(p.claimedAt),
      });
    }
    for (const p of gpuV2Powers) {
      expirations.push({
        source: "auto_mining_v2",
        slug: p.mode || null,
        name: "Auto Mining GPU (session)",
        hashRate: Number(p.hashRate) || 0,
        expiresAt: iso(p.expiresAt),
        playedAt: iso(p.earnedAt),
      });
    }
    expirations.sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)));

    const gameBySlug = new Map<
      string,
      { slug: string; name: string; totalHashRate: number; items: Array<Record<string, unknown>> }
    >();
    for (const g of gamePowers) {
      const slug = g.game?.slug || `power-game-${g.id}`;
      const name = g.game?.name || "Game";
      if (!gameBySlug.has(slug)) gameBySlug.set(slug, { slug, name, totalHashRate: 0, items: [] });
      const entry = gameBySlug.get(slug)!;
      const hr = Number(g.hashRate) || 0;
      entry.totalHashRate += hr;
      entry.items.push({ id: g.id, hashRate: hr, expiresAt: iso(g.expiresAt), playedAt: iso(g.playedAt) });
    }

    const machinesActive = allMiners.filter((m) => m.isActive);
    const machinesInactive = allMiners.filter((m) => !m.isActive);
    const machineItems = allMiners.map((m) => ({
      id: m.id,
      slotIndex: m.slotIndex,
      isActive: m.isActive,
      hashRate: Number(m.hashRate) || 0,
      minerName: m.miner?.name || "Machine",
      minerSlug: m.miner?.slug || null,
      imageUrl: m.miner?.imageUrl || m.imageUrl || null,
      roomNumber: m.userRack?.room?.roomNumber ?? null,
      rackPosition: m.userRack?.position ?? null,
    }));

    const byDay = new Map<string, { shareSum: number; workSum: number; n: number }>();
    for (const l of miningLogs) {
      const key = utcDateKey(new Date(l.createdAt));
      if (!byDay.has(key)) byDay.set(key, { shareSum: 0, workSum: 0, n: 0 });
      const b = byDay.get(key)!;
      b.shareSum += Number(l.sharePercentage) || 0;
      b.workSum += Number(l.workAccumulated) || 0;
      b.n += 1;
    }
    const miningLogByDay = [...byDay.entries()]
      .map(([date, v]) => ({
        date,
        avgSharePercent: v.n ? v.shareSum / v.n : 0,
        avgWork: v.n ? v.workSum / v.n : 0,
        samples: v.n,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const blkHistory = blkCycles.map((c) => ({
      windowStart: iso(c.windowStart),
      totalHashrate: Number(c.totalHashrate) || 0,
      minerCount: c.minerCount,
    }));

    // item 91: `sortedRank` já vem ordenado do cache; só a posição do usuário é por-viewer.
    const rankInfo = computeUserRank(sortedRank, userId);

    const blkSnap = await getBlkCyclePublicSnapshot();
    const lastPoolHr = blkSnap.lastCycle?.totalHashrate ?? 0;
    const payoutMode = userRow.miningPayoutMode === "blk" ? "blk" : "pol";
    let poolSharePercent: number | null = null;
    if (payoutMode === "blk" && lastPoolHr > 0 && agg.totalHashrate > 0) {
      poolSharePercent = (agg.totalHashrate / lastPoolHr) * 100;
    }

    const nextCheckinPowerRewards = checkinHashMilestones
      .filter((m) => streak < m.dayThreshold)
      .slice(0, 5)
      .map((m) => ({
        dayThreshold: m.dayThreshold,
        rewardValue: Number(m.rewardValue) || 0,
        validityDays: m.validityDays,
        displayTitle: m.displayTitle,
      }));

    res.json({
      ok: true,
      generatedAt: now.toISOString(),
      overview: {
        totalHashrate: agg.totalHashrate,
        permanentHashrate: agg.permanentHashrate,
        temporaryHashrate: agg.temporaryHashrate,
        permanentPercent: Math.round(permPct * 10) / 10,
        temporaryPercent: Math.round(tempPct * 10) / 10,
        breakdown: {
          machines: agg.permanentHashrate,
          gamesMinigame: agg.temporaryMinigameHashrate,
          gamesCheckin: agg.temporaryCheckinHashrate,
          youtube: agg.temporaryYoutubeHashrate,
          autoMining: agg.temporaryAutoMiningHashrate,
        },
        miningPayoutMode: payoutMode,
        nextExpirations: expirations.slice(0, 12),
      },
      machines: {
        activeCount: machinesActive.length,
        inactiveCount: machinesInactive.length,
        activeHashrate: machinesActive.reduce((s, m) => s + (Number(m.hashRate) || 0), 0),
        inactiveHashrate: machinesInactive.reduce((s, m) => s + (Number(m.hashRate) || 0), 0),
        items: machineItems,
      },
      youtube: {
        activeTotal: agg.temporaryYoutubeHashrate,
        activeItems: ytPowers.map((y) => ({
          id: y.id,
          hashRate: Number(y.hashRate) || 0,
          expiresAt: iso(y.expiresAt),
          sourceVideoId: y.sourceVideoId,
        })),
        history: ytHistory.map((h) => ({
          id: h.id,
          hashRate: Number(h.hashRate) || 0,
          claimedAt: iso(h.claimedAt),
          expiresAt: iso(h.expiresAt),
          sourceVideoId: h.sourceVideoId,
          status: h.status,
          createdAt: iso(h.createdAt),
        })),
      },
      games: {
        minigameTotal: agg.temporaryMinigameHashrate,
        checkinBonusTotal: agg.temporaryCheckinHashrate,
        checkinBonusSlug: CHECKIN_BONUS_GAME_SLUG,
        byGame: [...gameBySlug.values()].sort((a, b) => b.totalHashRate - a.totalHashRate),
      },
      autoMining: {
        total: agg.temporaryAutoMiningHashrate,
        items: gpuPowers.map((p) => ({
          id: p.id,
          gpuHashRate: Number(p.gpuHashRate) || 0,
          expiresAt: iso(p.expiresAt),
          claimedAt: iso(p.claimedAt),
        })),
      },
      checkin: { streak, nextHashrateMilestones: nextCheckinPowerRewards },
      otherSources: {
        referralHashrate: 0,
        stakingHashrate: 0,
        eventBonusHashrate: 0,
        note: "No standalone referral/staking hashrate is stored; referrals affect other systems.",
      },
      network: {
        userRank: rankInfo?.rank ?? null,
        totalRankedUsers: rankInfo?.totalUsers ?? sortedRank.length,
        activeUsersLast24h: activeUsers24h,
        lastBlkCycle: blkSnap.lastCycle
          ? {
              id: blkSnap.lastCycle.id,
              windowStart: iso(blkSnap.lastCycle.windowStart),
              totalHashrate: blkSnap.lastCycle.totalHashrate,
              minerCount: blkSnap.lastCycle.minerCount,
              totalReward: blkSnap.lastCycle.totalReward,
              distributed: blkSnap.lastCycle.distributed,
            }
          : null,
        blkPoolSharePercent: poolSharePercent != null ? Math.round(poolSharePercent * 10000) / 10000 : null,
        rewardPerCycle: blkSnap.rewardPerCycle,
        blkPaused: blkSnap.paused,
        activityWindowSec: blkSnap.activityWindowSec,
      },
      payout: {
        rows: [
          { key: "pol", labelKey: "powerStats.payout.pol", percent: payoutMode === "pol" ? 100 : 0, noteKey: "powerStats.payout.pol_note" },
          { key: "blk", labelKey: "powerStats.payout.blk", percent: payoutMode === "blk" ? 100 : 0, noteKey: "powerStats.payout.blk_note" },
        ],
      },
      history: {
        miningLogByDay,
        blkCycles: blkHistory,
      },
      projections: {
        permanentHashrate: agg.permanentHashrate,
        temporaryRemainingHashrate: agg.temporaryHashrate,
        hintKeys: [
          "powerStats.projection_hint_check_expiry",
          "powerStats.projection_hint_machines",
          "powerStats.projection_hint_minigames",
        ],
      },
      analytics: {
        miningLogPeakShare: miningLogs.length ? Math.max(...miningLogs.map((l) => Number(l.sharePercentage) || 0)) : 0,
        miningLogAvgShare:
          miningLogs.length > 0
            ? miningLogs.reduce((s, l) => s + (Number(l.sharePercentage) || 0), 0) / miningLogs.length
            : 0,
        miningLogSamples: miningLogs.length,
      },
    });
  } catch (e: unknown) {
    log.error("getPowerStats", { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ ok: false, message: "Não foi possível carregar as estatísticas de poder agora." });
  }
}

/**
 * GET /api/stats/earnings?period=7d|30d|90d|all
 * Consolidated POL earnings for dashboard (totals + cumulative history).
 */
export async function getEarningsStats(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ ok: false, message: "Session invalid." });
      return;
    }
    const period = parseEarningsPeriod(req.query.period);
    const payload = await getUserEarningsStats(userId, period);
    res.json({ ok: true, ...payload });
  } catch (e: unknown) {
    log.error("getEarningsStats", { error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ ok: false, message: "Não foi possível carregar os ganhos agora." });
  }
}
