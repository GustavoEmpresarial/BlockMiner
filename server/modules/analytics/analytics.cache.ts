// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Generic stale-while-revalidate cache for the admin analytics endpoints — same pattern as
 * `ranking.hashrate.ts`'s leaderboard cache and `stats.repository.ts`'s active-users cache.
 *
 * Why: every period/tab switch on /admin/analytics recomputed everything from scratch (no
 * cache anywhere in this module), including a "mining efficiency all-time" block in
 * getDistribution that doesn't even depend on the period param. Multiple admins looking at
 * the dashboard around the same time each paid that cost independently.
 */
const TTL_MS = Number(process.env.ADMIN_ANALYTICS_CACHE_TTL_MS || 45_000);
/** All-time aggregates (block rewards SUM, executive KPIs) change slowly — longer TTL avoids
 *  re-paying multi-second Postgres costs on every cache miss after the 45s default expires. */
const ALLTIME_TTL_MS = Number(process.env.ADMIN_ANALYTICS_ALLTIME_CACHE_TTL_MS || 300_000);
const cache = new Map();
const inFlight = new Map();
export async function getOrCompute(key, compute, ttlMs = TTL_MS) {
    const existing = cache.get(key);
    const fresh = existing && Date.now() - existing.computedAt < existing.ttlMs;
    if (existing && fresh)
        return existing.value;
    if (existing) {
        // Stale: kick off a background refresh (deduplicated) and serve the old value now.
        if (!inFlight.has(key)) {
            const refresh = compute()
                .then((value) => {
                cache.set(key, { value, computedAt: Date.now(), ttlMs });
                return value;
            })
                .finally(() => inFlight.delete(key));
            refresh.catch(() => {
                /* keep the stale value if the recompute fails — better stale than an error */
            });
            inFlight.set(key, refresh);
        }
        return existing.value;
    }
    // No cache yet (first hit after boot, or first hit for this key) — compute and wait.
    let promise = inFlight.get(key);
    if (!promise) {
        promise = compute().then((value) => {
            cache.set(key, { value, computedAt: Date.now(), ttlMs });
            return value;
        });
        promise.finally(() => inFlight.delete(key));
        inFlight.set(key, promise);
    }
    return promise;
}
export { ALLTIME_TTL_MS };
