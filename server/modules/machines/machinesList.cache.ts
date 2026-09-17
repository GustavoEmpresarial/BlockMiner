/**
 * Short TTL cache for authenticated machines reads (rooms / inventory / vault / slots).
 * Invalidate on install/uninstall/buy/vault move/inventory grant.
 */
import { createTtlMapCache } from "../../shared/cache/ttlMapCache.js";

export type MachinesListCacheKind = "rooms" | "inventory" | "vault" | "slots";

const MACHINES_LIST_CACHE_TTL_MS = Math.max(
  1_000,
  Number(process.env.MACHINES_LIST_CACHE_TTL_MS ?? 30_000) || 30_000,
);

const MACHINES_LIST_CACHE_MAX_KEYS = Math.max(
  100,
  Number(process.env.MACHINES_LIST_CACHE_MAX_KEYS ?? 20_000) || 20_000,
);

const cache = createTtlMapCache<unknown>({
  ttlMs: MACHINES_LIST_CACHE_TTL_MS,
  maxKeys: MACHINES_LIST_CACHE_MAX_KEYS,
});

const KINDS: readonly MachinesListCacheKind[] = ["rooms", "inventory", "vault", "slots"];

function cacheKey(kind: MachinesListCacheKind, userId: number): string {
  return `${kind}:${userId}`;
}

export function getMachinesListCacheTtlMs(): number {
  return MACHINES_LIST_CACHE_TTL_MS;
}

export function getMachinesListCache<T>(kind: MachinesListCacheKind, userId: number): T | undefined {
  const id = Number(userId);
  if (!Number.isFinite(id)) return undefined;
  return cache.get(cacheKey(kind, id)) as T | undefined;
}

export function setMachinesListCache<T>(kind: MachinesListCacheKind, userId: number, value: T): void {
  const id = Number(userId);
  if (!Number.isFinite(id)) return;
  cache.set(cacheKey(kind, id), value);
}

/** Drop all machines list entries for a user after mutations. */
export function invalidateMachinesListCache(userId: number): void {
  const id = Number(userId);
  if (!Number.isFinite(id)) return;
  for (const kind of KINDS) {
    cache.delete(cacheKey(kind, id));
  }
}

/** Test helper — clear entire cache. */
export function clearMachinesListCacheForTests(): void {
  cache.clear();
}
