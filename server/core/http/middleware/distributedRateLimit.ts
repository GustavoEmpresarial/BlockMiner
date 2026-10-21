/**
 * Sliding-window rate limiter — ported from legacy/server/middleware/distributedRateLimit.ts +
 * services/slidingWindowRateLimit.ts.
 *
 * Primary store: Redis, one atomic Lua script per check (sorted set of hit timestamps).
 * The Postgres path (hit timestamps in `CallbackQueue` rows, callbackType "SEC_SW_RL", under an
 * advisory lock) cost ~5 round trips to the remote DB per check; it is now the fallback when Redis
 * is unavailable, and an in-process limiter is the last resort, so an outage degrades rate
 * limiting instead of taking down the route.
 */
import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import prisma from "../../database/prisma.js";
import { withRedis } from "../../redis/index.js";
import { createRateLimiter } from "./rateLimit.js";
import { logger } from "../../logger/index.js";

const log = logger.child("DistributedRateLimit");

export type CreateDistributedRateLimiterOptions = {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request) => string;
  secondaryKeyGenerator?: (req: Request) => string | null | undefined;
  skip?: (req: Request) => boolean;
  message?: string;
  statusCode?: number;
  name?: string;
};

const memHits = new Map<string, number[]>();

function pruneMemoryTimestamps(timestamps: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

function memoryFallbackAllow(prefix: string, dedupeKey: string, windowMs: number, max: number): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const k = `${prefix}:${dedupeKey}`;
  let arr = memHits.get(k) || [];
  arr = pruneMemoryTimestamps(arr, windowMs, now);
  arr.push(now);
  memHits.set(k, arr);
  const count = arr.length;
  const oldest = arr[0] || now;
  const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
  if (count > max) return { ok: false, remaining: 0, retryAfterSec };
  return { ok: true, remaining: Math.max(max - count, 0), retryAfterSec: 0 };
}

function bucketHash(prefix: string, dedupeKey: string): string {
  return createHash("sha256").update(`${prefix}:${dedupeKey}`, "utf8").digest("hex");
}

/**
 * Same rule as the Postgres path: drop hits older than the window; at `max` reject without
 * recording; otherwise record this hit. Returns {allowed, count, oldestScore}.
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
local count = redis.call('ZCARD', key)
if count >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, count, oldest[2] or tostring(now)}
end
redis.call('ZADD', key, now, ARGV[4])
redis.call('PEXPIRE', key, windowMs)
return {1, count + 1, '0'}
`;

type SlidingResult = { ok: boolean; remaining: number; retryAfterSec: number };

async function redisSlidingWindow(
  r: { eval: (...args: (string | number)[]) => Promise<unknown> },
  h: string,
  windowMs: number,
  max: number,
  now: number,
): Promise<SlidingResult> {
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;
  const raw = (await r.eval(SLIDING_WINDOW_LUA, 1, `bm:swrl:${h}`, now, windowMs, max, member)) as [number, number, string];
  const allowed = Number(raw[0]) === 1;
  const count = Number(raw[1]);
  if (!allowed) {
    const oldest = Number(raw[2]) || now;
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  return { ok: true, remaining: Math.max(max - count, 0), retryAfterSec: 0 };
}

export async function slidingWindowAllow(opts: {
  dedupeKey: string;
  windowMs: number;
  max: number;
  redisPrefix: string;
}): Promise<SlidingResult> {
  const h = bucketHash(opts.redisPrefix, opts.dedupeKey);
  return withRedis(
    (r) => redisSlidingWindow(r as unknown as Parameters<typeof redisSlidingWindow>[0], h, opts.windowMs, opts.max, Date.now()),
    () => postgresSlidingWindowAllow(opts),
  );
}

async function postgresSlidingWindowAllow(opts: {
  dedupeKey: string;
  windowMs: number;
  max: number;
  redisPrefix: string;
}): Promise<{ ok: boolean; remaining: number; retryAfterSec: number }> {
  const { dedupeKey, windowMs, max, redisPrefix } = opts;
  const now = Date.now();
  const h = bucketHash(redisPrefix, dedupeKey);

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `swrl:${h}`);
      const row = await tx.callbackQueue.findFirst({ where: { callbackType: "SEC_SW_RL", callbackHash: h } });
      const data = row?.data && typeof row.data === "object" ? (row.data as Record<string, unknown>) : {};
      const rawHits = Array.isArray(data.hits) ? (data.hits as number[]) : [];
      let hits = rawHits.filter((t) => typeof t === "number" && t > now - windowMs);

      if (hits.length >= max) {
        const oldest = hits[0] || now;
        return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
      }
      hits.push(now);
      const payload = { hits, v: 1 };
      if (row?.id) {
        await tx.callbackQueue.update({ where: { id: row.id }, data: { data: payload, processedAt: new Date() } });
      } else {
        await tx.callbackQueue.create({
          data: { callbackType: "SEC_SW_RL", callbackHash: h, data: payload, status: "processed", processedAt: new Date() },
        });
      }
      return { ok: true, remaining: Math.max(max - hits.length, 0), retryAfterSec: 0 };
    });
  } catch (err: unknown) {
    log.warn("Sliding-window Postgres check failed; using in-memory fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
    return memoryFallbackAllow(redisPrefix, dedupeKey, windowMs, max);
  }
}

export function createDistributedRateLimiter(opts: CreateDistributedRateLimiterOptions = {}): RequestHandler {
  const { windowMs = 60_000, max = 30, keyGenerator, secondaryKeyGenerator, skip, message, statusCode = 429, name = "global" } = opts;

  const fallback = createRateLimiter({ windowMs, max, keyGenerator, skip, message, statusCode });

  return async function distributedRateLimiter(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (typeof skip === "function" && skip(req)) {
      next();
      return;
    }
    const resolveKey: (r: Request) => string =
      typeof keyGenerator === "function"
        ? keyGenerator
        : (r) => `${r.ip}:${r.path}:${r.user?.id ? `user:${r.user.id}` : "anon"}`;
    const dedupeKey = resolveKey(req);

    try {
      const primary = await slidingWindowAllow({ dedupeKey, windowMs, max, redisPrefix: `rl:${name}:p` });
      if (!primary.ok) {
        if (typeof res.setHeader === "function") {
          res.setHeader("Retry-After", String(primary.retryAfterSec));
        }
        res.status(statusCode).json({ ok: false, code: "RATE_LIMIT_EXCEEDED", message: message || "Too many requests. Please slow down and try again.", details: { retryAfterSec: primary.retryAfterSec } });
        return;
      }
      if (typeof secondaryKeyGenerator === "function") {
        const secKey = secondaryKeyGenerator(req);
        if (secKey) {
          const secondary = await slidingWindowAllow({ dedupeKey: secKey, windowMs, max, redisPrefix: `rl:${name}:s` });
          if (!secondary.ok) {
            if (typeof res.setHeader === "function") {
              res.setHeader("Retry-After", String(secondary.retryAfterSec));
            }
            res.status(statusCode).json({ ok: false, code: "RATE_LIMIT_EXCEEDED", message: message || "Too many requests. Please slow down and try again.", details: { retryAfterSec: secondary.retryAfterSec } });
            return;
          }
        }
      }
      if (typeof res.setHeader === "function") {
        res.setHeader("X-RateLimit-Limit", String(max));
        res.setHeader("X-RateLimit-Remaining", String(primary.remaining));
      }
      next();
    } catch (err: unknown) {
      log.warn("Distributed rate limiter failed; using in-process fallback", {
        limiterName: name,
        error: err instanceof Error ? err.message : String(err),
      });
      fallback(req, res, next);
    }
  };
}

/** @internal test helper */
export function __resetSlidingWindowMemoryForTests(): void {
  memHits.clear();
}
