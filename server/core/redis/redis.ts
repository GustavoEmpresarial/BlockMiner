/**
 * Shared Redis connection — ported from legacy/server/services/redisClient.ts.
 *
 * Used as a PREFERRED low-latency layer for distributed locks/rate-limits/idempotency,
 * with Postgres (`callback_queue`) remaining the safety-net fallback everywhere it was
 * already wired (distributedRateLimit.ts, idempotency.ts, login.lockout.ts,
 * withdrawal.auto-send.ts).
 *
 * Graceful degradation, matching the rest of the project's "works without it, warns in the
 * log" posture (ProxyCheck.io, pg_dump, TELEGRAM_BOT_TOKEN):
 *  - REDIS_URL unset → getRedis() returns null, no connection attempted, no crash.
 *  - REDIS_URL set but unreachable → connection errors are logged, never thrown out of this
 *    module; callers must treat a null/failed client as "fall back to Postgres".
 */
import { Redis } from "ioredis";
import type { RedisOptions } from "ioredis";
import { logger } from "../logger/index.js";

const log = logger.child("Redis");

let client: Redis | null = null;
let intentionallyDisabled = false;

export function getRedisUrl(): string {
  return String(process.env.REDIS_URL || "").trim();
}

/**
 * Returns the shared ioredis client, lazily created on first call. Returns null when
 * REDIS_URL is unset or Redis has been disabled for tests — callers must fall back to
 * Postgres in that case, never throw.
 */
export function getRedis(): Redis | null {
  if (intentionallyDisabled) return null;
  const url = getRedisUrl();
  if (!url) return null;
  if (client) return client;

  const connectTimeoutMs = Number.parseInt(String(process.env.REDIS_CONNECT_TIMEOUT_MS || "3000"), 10) || 3000;
  const commandTimeoutMs = Number.parseInt(String(process.env.REDIS_COMMAND_TIMEOUT_MS || "5000"), 10) || 5000;
  const options: RedisOptions = {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: true,
    connectTimeout: connectTimeoutMs,
    commandTimeout: commandTimeoutMs,
  };

  client = new Redis(url, options);
  client.on("error", (err: Error) => {
    log.warn("Redis client error — callers fall back to Postgres", { message: err.message });
  });
  client.on("connect", () => {
    log.info("Redis connected", { url: url.replace(/\/\/.*@/, "//***@") });
  });
  return client;
}

/** Ensures the lazily-connected client is actually connected. Never throws — returns null on failure. */
export async function ensureRedisConnected(): Promise<Redis | null> {
  const r = getRedis();
  if (!r) return null;
  if (r.status === "wait" || r.status === "end") {
    try {
      await r.connect();
    } catch (e: unknown) {
      log.warn("Redis connect failed — falling back to Postgres", { message: e instanceof Error ? e.message : String(e) });
      return null;
    }
  }
  return r;
}

/**
 * Convenience wrapper: runs `fn` against a connected Redis client, or returns `fallback`
 * (sync value or thunk) if Redis is unavailable or the operation throws. Every consumer
 * should route through this instead of calling getRedis() + try/catch by hand, so the
 * "Redis is an optimization, Postgres is the truth" rule is enforced in one place.
 */
export async function withRedis<T>(fn: (r: Redis) => Promise<T>, fallback: T | (() => T | Promise<T>)): Promise<T> {
  const r = await ensureRedisConnected();
  if (!r) return typeof fallback === "function" ? await (fallback as () => T | Promise<T>)() : fallback;
  try {
    return await fn(r);
  } catch (err: unknown) {
    log.warn("Redis operation failed — falling back to Postgres", { message: err instanceof Error ? err.message : String(err) });
    return typeof fallback === "function" ? await (fallback as () => T | Promise<T>)() : fallback;
  }
}

export async function shutdownRedis(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      try {
        client.disconnect();
      } catch {
        /* ignore */
      }
    }
    client = null;
  }
}

/** @internal Tests only — forces all distributed helpers to use their non-Redis fallback. */
export function __disableRedisForTests(): void {
  intentionallyDisabled = true;
  client = null;
}

/** @internal Tests only */
export function __enableRedisForTests(): void {
  intentionallyDisabled = false;
}
