/**
 * Bounded in-process TTL map — shared by machines list caches and similar hot reads.
 * FIFO eviction when maxKeys is exceeded (Map insertion order).
 */

export type TtlMapCacheOptions = {
  ttlMs: number;
  maxKeys?: number;
};

export type TtlMapCache<T> = {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
};

export function createTtlMapCache<T>(opts: TtlMapCacheOptions): TtlMapCache<T> {
  const ttlMs = Math.max(1, opts.ttlMs);
  const maxKeys = Math.max(1, opts.maxKeys ?? 20_000);
  const store = new Map<string, { at: number; value: T }>();

  function evictOverflow(): void {
    while (store.size > maxKeys) {
      const oldest = store.keys().next().value;
      if (oldest == null) break;
      store.delete(oldest);
    }
  }

  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at >= ttlMs) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: T): void {
      if (store.has(key)) store.delete(key);
      store.set(key, { at: Date.now(), value });
      evictOverflow();
    },
    delete(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
    get size() {
      return store.size;
    },
  };
}
