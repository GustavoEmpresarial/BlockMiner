/**
 * Ported from legacy/server/modules/stats/infrastructure/repositories/stats.repository.ts.
 * Flat under the module (no infrastructure/repositories/ subpath) per current/'s doctrine —
 * subpaths are a consequence of growth, not a required layer.
 */
import prisma from "../../core/database/prisma.js";

export async function findUserForPowerStats(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      miningPayoutMode: true,
      lastHeartbeatAt: true,
      lastLoginAt: true,
    },
  });
}

export async function listUserMinersWithRack(userId: number) {
  return prisma.userMiner.findMany({
    where: { userId },
    include: {
      miner: { select: { name: true, slug: true, imageUrl: true } },
      userRack: {
        include: {
          room: { select: { id: true, roomNumber: true } },
        },
      },
    },
    orderBy: { slotIndex: "asc" },
  });
}

export async function listActiveGamePowers(userId: number, now: Date) {
  return prisma.userPowerGame.findMany({
    where: { userId, expiresAt: { gt: now } },
    include: { game: { select: { id: true, name: true, slug: true } } },
    orderBy: { expiresAt: "asc" },
  });
}

export async function listActiveYoutubePowers(userId: number, now: Date) {
  return prisma.youtubeWatchPower.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" },
  });
}

export async function listActiveGpuPowers(userId: number, now: Date) {
  return prisma.autoMiningGpu.findMany({
    where: { userId, isClaimed: true, expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" },
  });
}

export async function listActiveGpuV2Powers(userId: number, now: Date) {
  return prisma.autoMiningV2PowerGrant.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { expiresAt: "asc" },
    select: { id: true, hashRate: true, earnedAt: true, expiresAt: true, mode: true },
  });
}

export async function listRecentYoutubeHistory(userId: number, take: number) {
  return prisma.youtubeWatchHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      hashRate: true,
      claimedAt: true,
      expiresAt: true,
      sourceVideoId: true,
      status: true,
      createdAt: true,
    },
  });
}

export async function listRecentMiningLogs(userId: number, sinceMs: number) {
  return prisma.miningRewardsLog.findMany({
    where: { userId, createdAt: { gte: new Date(sinceMs) } },
    select: { createdAt: true, sharePercentage: true, workAccumulated: true, blockNumber: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function listRecentBlkCycles(take: number) {
  return prisma.blkRewardCycle.findMany({
    orderBy: { windowStart: "desc" },
    take,
    select: {
      windowStart: true,
      totalHashrate: true,
      minerCount: true,
    },
  });
}

async function queryActiveUsersInWindow(sinceMs: number): Promise<number> {
  return prisma.user.count({
    where: {
      isBanned: false,
      OR: [{ lastHeartbeatAt: { gte: new Date(sinceMs) } }, { lastLoginAt: { gte: new Date(sinceMs) } }],
    },
  });
}

/**
 * `countActiveUsersInWindow` é um número GLOBAL (24h de janela fixa, não varia por usuário),
 * mas era recomputado com um full scan da tabela `users` a cada poll de `GET /api/stats/power`
 * de CADA usuário com a tela aberta. Mesmo padrão stale-while-revalidate usado no leaderboard
 * de hashrate (ver `ranking.hashrate.ts`): serve do cache em memória, refresh assíncrono
 * quando vence.
 */
const ACTIVE_USERS_CACHE_TTL_MS = Number(process.env.STATS_ACTIVE_USERS_CACHE_TTL_MS || 60_000);
let activeUsersCache: { count: number; computedAt: number } | null = null;
let activeUsersRefreshInFlight: Promise<number> | null = null;

async function refreshActiveUsersCache(sinceMs: number): Promise<number> {
  const count = await queryActiveUsersInWindow(sinceMs);
  activeUsersCache = { count, computedAt: Date.now() };
  return count;
}

export async function countActiveUsersInWindow(sinceMs: number): Promise<number> {
  const fresh = activeUsersCache && Date.now() - activeUsersCache.computedAt < ACTIVE_USERS_CACHE_TTL_MS;
  if (activeUsersCache && fresh) return activeUsersCache.count;

  if (activeUsersCache) {
    if (!activeUsersRefreshInFlight) {
      activeUsersRefreshInFlight = refreshActiveUsersCache(sinceMs).finally(() => {
        activeUsersRefreshInFlight = null;
      });
      activeUsersRefreshInFlight.catch(() => {
        /* mantém o cache velho se a recomputação falhar — melhor stale que erro */
      });
    }
    return activeUsersCache.count;
  }

  return refreshActiveUsersCache(sinceMs);
}

export async function listActiveCheckinHashMilestones() {
  return prisma.checkinStreakMilestone.findMany({
    where: { active: true, rewardType: "hashrate" },
    orderBy: [{ sortOrder: "asc" }, { dayThreshold: "asc" }],
    select: { dayThreshold: true, rewardValue: true, validityDays: true, displayTitle: true },
  });
}
