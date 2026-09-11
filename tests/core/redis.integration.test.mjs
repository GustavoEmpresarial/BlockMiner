import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

// Real Redis integration test — connects to the dev Redis (docker-compose.dev.yml,
// redis-dev service, 127.0.0.1:6379 (docker-compose.yml), REDIS_URL in current/.env). No mocking of the
// connection here; a couple of unit-style assertions cover the "no REDIS_URL" path with a
// real env-var mutation instead of a mock.
const redisMod = await import("../../server/core/redis/index.ts");

test("getRedisUrl reflects REDIS_URL from env (dev Redis on :6380)", () => {
  assert.equal(redisMod.getRedisUrl(), String(process.env.REDIS_URL || "").trim());
});

test("getRedis() connects to the real dev Redis and responds to PING", async () => {
  const r = await redisMod.ensureRedisConnected();
  assert.ok(r, "expected a live Redis client — is redis-dev up on 127.0.0.1:6379 (docker-compose.yml)?");
  const pong = await r.ping();
  assert.equal(pong, "PONG");
});

test("withRedis() runs against the real client and returns its result", async () => {
  const key = `blockminer:test:withredis:${Date.now()}`;
  const result = await redisMod.withRedis(
    async (r) => {
      await r.set(key, "hello", "EX", 30);
      return r.get(key);
    },
    "fallback-should-not-be-used",
  );
  assert.equal(result, "hello");
  const r = await redisMod.ensureRedisConnected();
  await r.del(key).catch(() => {});
});

test("getRedis() returns null and never throws when REDIS_URL is unset (graceful degradation)", async () => {
  const prevUrl = process.env.REDIS_URL;
  try {
    redisMod.__disableRedisForTests();
    delete process.env.REDIS_URL;
    assert.equal(redisMod.getRedis(), null);
    const connected = await redisMod.ensureRedisConnected();
    assert.equal(connected, null);
  } finally {
    redisMod.__enableRedisForTests();
    if (prevUrl !== undefined) process.env.REDIS_URL = prevUrl;
  }
});

test("withRedis() falls back to the provided value when Redis is disabled", async () => {
  try {
    redisMod.__disableRedisForTests();
    const result = await redisMod.withRedis(async () => {
      throw new Error("should never run — Redis disabled");
    }, "fallback-value");
    assert.equal(result, "fallback-value");
  } finally {
    redisMod.__enableRedisForTests();
  }
});

test.after(async () => {
  await redisMod.shutdownRedis().catch(() => {});
});

test("withRedis() accepts a thunk fallback and calls it lazily", async () => {
  try {
    redisMod.__disableRedisForTests();
    let thunkCalled = false;
    const result = await redisMod.withRedis(
      async () => "unused",
      () => {
        thunkCalled = true;
        return "thunk-value";
      },
    );
    assert.equal(result, "thunk-value");
    assert.equal(thunkCalled, true);
  } finally {
    redisMod.__enableRedisForTests();
  }
});
