/**
 * The sliding-window limiter used ~5 round trips to the remote Postgres per limited request
 * (transaction + advisory lock + findFirst + update). It now runs one atomic Lua script on Redis,
 * keeping Postgres (then memory) as fallback.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const spec = (p) => pathToFileURL(path.join(root, p)).href;

/** Minimal Redis that interprets the limiter script the same way the Lua does. */
const zsets = new Map();
let redisDown = false;
let evalCalls = 0;
const fakeRedis = {
  async eval(_script, _n, key, now, windowMs, max, member) {
    evalCalls += 1;
    if (redisDown) throw new Error("ECONNREFUSED");
    now = Number(now); windowMs = Number(windowMs); max = Number(max);
    const z = (zsets.get(key) ?? []).filter((s) => s.score > now - windowMs);
    if (z.length >= max) {
      zsets.set(key, z);
      return [0, z.length, String(z[0].score)];
    }
    z.push({ score: now, member });
    zsets.set(key, z);
    return [1, z.length, "0"];
  },
};

let pgCalls = 0;
mock.module(spec("server/core/redis/index.ts"), {
  namedExports: {
    withRedis: async (fn, fallback) => {
      try {
        return await fn(fakeRedis);
      } catch {
        return typeof fallback === "function" ? fallback() : fallback;
      }
    },
  },
});
mock.module(spec("server/core/database/prisma.ts"), {
  defaultExport: {
    $transaction: async () => {
      pgCalls += 1;
      throw new Error("pg unavailable in this test");
    },
  },
});

const { slidingWindowAllow, __resetSlidingWindowMemoryForTests } = await import(
  "../../server/core/http/middleware/distributedRateLimit.ts"
);

test("allows up to max in the window on Redis, then rejects with Retry-After; Postgres untouched", async () => {
  zsets.clear(); pgCalls = 0; evalCalls = 0; redisDown = false;
  const opts = { dedupeKey: "ip:1.2.3.4", windowMs: 60_000, max: 3, redisPrefix: "rl:t:p" };
  const r = [];
  for (let i = 0; i < 4; i += 1) r.push(await slidingWindowAllow(opts));
  assert.deepEqual(r.map((x) => x.ok), [true, true, true, false]);
  assert.deepEqual(r.map((x) => x.remaining), [2, 1, 0, 0]);
  assert.ok(r[3].retryAfterSec >= 1 && r[3].retryAfterSec <= 60);
  assert.equal(evalCalls, 4, "one round trip per check");
  assert.equal(pgCalls, 0);
  // Keys never carry the raw IP/user id.
  assert.ok([...zsets.keys()].every((k) => /^bm:swrl:[0-9a-f]{64}$/.test(k)), [...zsets.keys()].join(","));
});

test("separate keys and prefixes have separate buckets", async () => {
  zsets.clear(); redisDown = false;
  const a = await slidingWindowAllow({ dedupeKey: "u1", windowMs: 60_000, max: 1, redisPrefix: "rl:x:p" });
  const b = await slidingWindowAllow({ dedupeKey: "u2", windowMs: 60_000, max: 1, redisPrefix: "rl:x:p" });
  const c = await slidingWindowAllow({ dedupeKey: "u1", windowMs: 60_000, max: 1, redisPrefix: "rl:x:s" });
  assert.deepEqual([a.ok, b.ok, c.ok], [true, true, true]);
});

test("Redis down: falls back (Postgres, then memory) instead of failing open or throwing", async () => {
  zsets.clear(); redisDown = true; pgCalls = 0;
  __resetSlidingWindowMemoryForTests();
  const opts = { dedupeKey: "ip:9.9.9.9", windowMs: 60_000, max: 2, redisPrefix: "rl:f:p" };
  const r = [];
  for (let i = 0; i < 3; i += 1) r.push(await slidingWindowAllow(opts));
  assert.deepEqual(r.map((x) => x.ok), [true, true, false]);
  assert.equal(pgCalls, 3, "Postgres tried before memory");
  redisDown = false;
});
