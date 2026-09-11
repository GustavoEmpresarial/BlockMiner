import { logger } from "../../core/logger/index.js";
import { bumpCacheVersion } from "./tournaments.metrics.js";

const log = logger.child("TournamentCache");

/** In-process leaderboard cache (no Redis in current/). */
const DEFAULT_TTL_MS = 15_000;
const lbCache = new Map<number, { at: number; data: unknown }>();

export async function invalidateLeaderboardCache(tournamentId: number): Promise<void> {
  lbCache.delete(tournamentId);
  const version = await bumpCacheVersion(tournamentId);
  log.info("tournament.cache.invalidated", { tournamentId, cacheVersion: version, redis: false });
}

export async function getCachedLeaderboard<T>(tournamentId: number): Promise<T | null> {
  const hit = lbCache.get(tournamentId);
  if (!hit) return null;
  if (Date.now() - hit.at > DEFAULT_TTL_MS) {
    lbCache.delete(tournamentId);
    return null;
  }
  return hit.data as T;
}

export async function setCachedLeaderboard<T>(tournamentId: number, data: T): Promise<void> {
  lbCache.set(tournamentId, { at: Date.now(), data });
}
