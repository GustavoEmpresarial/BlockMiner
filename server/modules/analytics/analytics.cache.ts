/**
 * Generic stale-while-revalidate cache for the admin analytics endpoints — same pattern as
 * `ranking.hashrate.ts`'s leaderboard cache and `stats.repository.ts`'s active-users cache.
 */

interface CacheEntry<T> {
  value: T;
  computedAt: number;
  ttlMs: number;
}

const TTL_MS = Number(process.env.ADMIN_ANALYTICS_CACHE_TTL_MS || 45_000);
/** All-time aggregates (block rewards SUM, executive KPIs) change slowly — longer TTL avoids
 *  re-paying multi-second Postgres costs on every cache miss after the 45s default expires. */
const ALLTIME_TTL_MS = Number(process.env.ADMIN_ANALYTICS_ALLTIME_CACHE_TTL_MS || 300_000);

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export async function getOrCompute<T>(
  key: string,
  compute: () => Promise<T>,
  ttlMs: number = TTL_MS
): Promise<T> {
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  const fresh = existing && Date.now() - existing.computedAt < existing.ttlMs;
  if (existing && fresh) {
    return existing.value;
  }
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
      inFlight.set(key, refresh as Promise<unknown>);
    }
    return existing.value;
  }

  // No cache yet (first hit after boot, or first hit for this key) — compute and wait.
  let promise = inFlight.get(key) as Promise<T> | undefined;
  if (!promise) {
    promise = compute().then((value) => {
      cache.set(key, { value, computedAt: Date.now(), ttlMs });
      return value;
    });
    promise.finally(() => inFlight.delete(key));
    inFlight.set(key, promise as Promise<unknown>);
  }
  return promise;
}

export function clearAnalyticsCache(): void {
  cache.clear();
  inFlight.clear();
}

export { ALLTIME_TTL_MS, TTL_MS };

