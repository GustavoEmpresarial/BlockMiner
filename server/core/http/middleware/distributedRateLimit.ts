/**
 * Sliding-window rate limiter backed by Postgres (no Redis) — ported from
 * legacy/server/middleware/distributedRateLimit.ts + services/slidingWindowRateLimit.ts,
 * merged into one file since core/redis isn't built yet (Fase 2 scope, see plan).
 *
 * Stores hit timestamps in `CallbackQueue` rows (callbackType "SEC_SW_RL"), guarded by a
 * Postgres advisory lock. Falls back to an in-process in-memory limiter if Postgres is
 * unreachable, so a DB hiccup degrades rate limiting instead of taking down the route.
 */
import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import prisma from "../../database/prisma.js";
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

export async function slidingWindowAllow(opts: {
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
        res.setHeader("Retry-After", String(primary.retryAfterSec));
        res.status(statusCode).json({ ok: false, code: "RATE_LIMIT_EXCEEDED", message: message || "Too many requests. Please slow down and try again.", details: { retryAfterSec: primary.retryAfterSec } });
        return;
      }
      if (typeof secondaryKeyGenerator === "function") {
        const secKey = secondaryKeyGenerator(req);
        if (secKey) {
          const secondary = await slidingWindowAllow({ dedupeKey: secKey, windowMs, max, redisPrefix: `rl:${name}:s` });
          if (!secondary.ok) {
            res.setHeader("Retry-After", String(secondary.retryAfterSec));
            res.status(statusCode).json({ ok: false, code: "RATE_LIMIT_EXCEEDED", message: message || "Too many requests. Please slow down and try again.", details: { retryAfterSec: secondary.retryAfterSec } });
            return;
          }
        }
      }
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(primary.remaining));
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
