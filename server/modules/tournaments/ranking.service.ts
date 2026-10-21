import { buildRankingRows } from "./ranking.hashrate.js";
import * as rankingRepo from "./ranking.repository.js";
import { withAvatarUrls } from "../avatar/avatar.lookup.js";

export { buildRankingRows } from "./ranking.hashrate.js";

async function computeTopRanking(limit: number, includeAutoMiningV2: boolean) {
  const now = new Date();
  const users = await rankingRepo.listRankableUsers(now, includeAutoMiningV2);
  const top = buildRankingRows(users)
    .slice(0, limit)
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  return withAvatarUrls(top, now);
}

type TopRanking = Awaited<ReturnType<typeof computeTopRanking>>;

/**
 * The public leaderboard is identical for every viewer but cost 1–8 s to build (every non-banned
 * user with nested power rows). Same stale-while-revalidate cache as `getCachedRankingRows`:
 * fresh → serve; stale → serve the old list and rebuild once in background; empty → wait once.
 */
const TOP_RANKING_CACHE_TTL_MS = Number(process.env.RANKING_TOP_CACHE_TTL_MS || 60_000);
const topRankingCache = new Map<string, { rows: TopRanking; computedAt: number }>();
const topRankingInFlight = new Map<string, Promise<TopRanking>>();

function refreshTopRanking(key: string, limit: number, includeAutoMiningV2: boolean): Promise<TopRanking> {
  let p = topRankingInFlight.get(key);
  if (!p) {
    p = computeTopRanking(limit, includeAutoMiningV2)
      .then((rows) => {
        topRankingCache.set(key, { rows, computedAt: Date.now() });
        return rows;
      })
      .finally(() => topRankingInFlight.delete(key));
    topRankingInFlight.set(key, p);
  }
  return p;
}

export async function getTopRanking(limit = 50, includeAutoMiningV2: boolean) {
  const key = `${limit}:${includeAutoMiningV2 ? 1 : 0}`;
  const cached = topRankingCache.get(key);
  if (cached && Date.now() - cached.computedAt < TOP_RANKING_CACHE_TTL_MS) return cached.rows;
  if (cached) {
    refreshTopRanking(key, limit, includeAutoMiningV2).catch(() => {
      /* keep serving the stale list if the rebuild fails */
    });
    return cached.rows;
  }
  return refreshTopRanking(key, limit, includeAutoMiningV2);
}

/** Test hook. */
export function __resetTopRankingCacheForTests() {
  topRankingCache.clear();
  topRankingInFlight.clear();
}

export async function getUserRoomRankingProfile(username: string) {
  const now = new Date();
  const ROOM_MAX = parseInt(process.env.ROOM_MAX || "4", 10);
  const targetUser = await rankingRepo.findUserRoomProfile(username, now);
  if (!targetUser) return null;

  const mappedMiners = targetUser.miners.map((m) => ({
    id: m.id,
    hashRate: m.hashRate,
    slotIndex: m.slotIndex,
    imageUrl: m.imageUrl,
    level: m.level,
    slotSize: m.slotSize,
    minerName: m.miner?.name || "Miner",
  }));

  const gamePower =
    targetUser.gamePowers.reduce((sum, p) => sum + (p.hashRate || 0), 0) +
    targetUser.ytPowers.reduce((sum, p) => sum + (p.hashRate || 0), 0) +
    (targetUser.gpuAccess || []).reduce((sum, p) => sum + (p.gpuHashRate || 0), 0);

  const racks: Record<number, string | null> = {};
  targetUser.rackConfigs.forEach((config) => {
    racks[config.rackIndex] = config.customName;
  });

  const unlockedRooms = new Set(targetUser.userRooms.map((r) => r.roomNumber));
  const roomList = Array.from({ length: ROOM_MAX }, (_, i) => ({
    roomNumber: i + 1,
    unlocked: unlockedRooms.has(i + 1),
  }));

  return {
    ...targetUser,
    miners: mappedMiners,
    racks,
    gamePower,
    rooms: roomList,
    roomMax: ROOM_MAX,
  };
}
