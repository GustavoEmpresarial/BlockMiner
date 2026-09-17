/**
 * Unit: shared TTL map + machines list cache invalidate.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { createTtlMapCache } from "../../server/shared/cache/ttlMapCache.ts";
import {
  clearMachinesListCacheForTests,
  getMachinesListCache,
  getMachinesListCacheTtlMs,
  invalidateMachinesListCache,
  setMachinesListCache,
} from "../../server/modules/machines/machinesList.cache.ts";

describe("createTtlMapCache", () => {
  it("returns set values until TTL expires", () => {
    const cache = createTtlMapCache({ ttlMs: 60_000, maxKeys: 10 });
    cache.set("a", { n: 1 });
    assert.deepEqual(cache.get("a"), { n: 1 });
  });

  it("evicts oldest when maxKeys exceeded", () => {
    const cache = createTtlMapCache({ ttlMs: 60_000, maxKeys: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.get("b"), 2);
    assert.equal(cache.get("c"), 3);
    assert.equal(cache.size, 2);
  });

  it("expires entries after ttlMs", async () => {
    const cache = createTtlMapCache({ ttlMs: 20, maxKeys: 10 });
    cache.set("x", "y");
    assert.equal(cache.get("x"), "y");
    await new Promise((r) => setTimeout(r, 35));
    assert.equal(cache.get("x"), undefined);
  });
});

describe("machinesList.cache", () => {
  beforeEach(() => {
    clearMachinesListCacheForTests();
  });

  it("exposes MACHINES_LIST_CACHE_TTL_MS default via env reader (>= 1000)", () => {
    assert.ok(getMachinesListCacheTtlMs() >= 1000);
  });

  it("get/set round-trip per kind", () => {
    setMachinesListCache("rooms", 7, { ok: true, rooms: [] });
    setMachinesListCache("inventory", 7, [{ id: 1 }]);
    assert.deepEqual(getMachinesListCache("rooms", 7), { ok: true, rooms: [] });
    assert.deepEqual(getMachinesListCache("inventory", 7), [{ id: 1 }]);
    assert.equal(getMachinesListCache("vault", 7), undefined);
  });

  it("invalidateMachinesListCache clears all kinds for that user only", () => {
    setMachinesListCache("rooms", 1, { a: 1 });
    setMachinesListCache("inventory", 1, { b: 2 });
    setMachinesListCache("vault", 1, { c: 3 });
    setMachinesListCache("slots", 1, { d: 4 });
    setMachinesListCache("rooms", 2, { keep: true });

    invalidateMachinesListCache(1);

    assert.equal(getMachinesListCache("rooms", 1), undefined);
    assert.equal(getMachinesListCache("inventory", 1), undefined);
    assert.equal(getMachinesListCache("vault", 1), undefined);
    assert.equal(getMachinesListCache("slots", 1), undefined);
    assert.deepEqual(getMachinesListCache("rooms", 2), { keep: true });
  });
});
