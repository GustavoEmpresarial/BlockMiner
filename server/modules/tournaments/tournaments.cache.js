import { logger } from "../../core/logger/index.js";
import { bumpCacheVersion } from "./tournaments.metrics.js";
const log = logger.child("TournamentCache");
/** In-process leaderboard cache (no Redis in current/). */
const DEFAULT_TTL_MS = 15_000;
const lbCache = new Map();
export async function invalidateLeaderboardCache(tournamentId) {
    lbCache.delete(tournamentId);
    const version = await bumpCacheVersion(tournamentId);
    log.info("tournament.cache.invalidated", { tournamentId, cacheVersion: version, redis: false });
}
export async function getCachedLeaderboard(tournamentId) {
    const hit = lbCache.get(tournamentId);
    if (!hit)
        return null;
    if (Date.now() - hit.at > DEFAULT_TTL_MS) {
        lbCache.delete(tournamentId);
        return null;
    }
    return hit.data;
}
export async function setCachedLeaderboard(tournamentId, data) {
    lbCache.set(tournamentId, { at: Date.now(), data });
}
