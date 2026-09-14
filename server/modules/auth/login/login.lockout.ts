/**
 * Brute-force protection: progressive lockout after repeated failed logins, keyed
 * independently by IP and by user id. Faithful port of
 * legacy/server/services/accountLockoutService.ts's tiered thresholds
 * (5 failures -> 15min lock, 10 failures -> 60min lock) and its Postgres-backed
 * counter storage (the `callback_queue` table, reused as a generic keyed-counter
 * store via callbackType "SEC_LOCK" + a sha256 hash of the ip/user key).
 *
 * Deviation from legacy: legacy wraps each read/bump in a Postgres advisory
 * transaction lock (`advisoryXactTryLockOrThrow`) to serialize concurrent
 * updates to the same counter row. `current/` has no advisory-lock helper
 * ported yet, so this uses a plain `$transaction` (read-committed) without an
 * advisory lock. Under concurrent requests for the exact same ip/user within
 * the same millisecond this can under-count by a request or two (last writer
 * wins) — acceptable for a security counter whose failure mode (a few extra
 * allowed attempts before lockout kicks in) is the same fail-open direction
 * legacy already accepts for its own advisory-lock-failure fallback.
 */
import crypto from "node:crypto";
import prisma from "../../../core/database/prisma.js";
import { logger } from "../../../core/logger/index.js";
import { normalizeIp } from "../../ip-intelligence/index.js";

const log = logger.child("AuthLockout");

const TIER_FIRST = 5;
const TIER_SECOND = 10;
const LOCK_MS_FIRST = 15 * 60 * 1000;
const LOCK_MS_SECOND = 60 * 60 * 1000;

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function ipHashKey(ip: string | null | undefined): string {
  const normalized = normalizeIp(ip) || String(ip || "0.0.0.0");
  return crypto.createHash("sha256").update(`ip:${normalized}`).digest("hex");
}

function userHashKey(userId: number): string {
  return crypto.createHash("sha256").update(`user:${userId}`).digest("hex");
}

export type LockStatus = { locked: false } | { locked: true; until: number };

async function readCounter(hash: string): Promise<{ failCount: number; lockUntilMs: number }> {
  const row = await prisma.callbackQueue.findFirst({
    where: { callbackType: "SEC_LOCK", callbackHash: hash },
  });
  const d: Record<string, unknown> = isPlainRecord(row?.data) ? (row!.data as Record<string, unknown>) : {};
  return {
    failCount: Number(d.failCount ?? 0),
    lockUntilMs: Number(d.lockUntilMs ?? 0),
  };
}

async function checkRow(hash: string): Promise<LockStatus> {
  try {
    const { lockUntilMs } = await readCounter(hash);
    const now = Date.now();
    if (lockUntilMs > now) return { locked: true, until: lockUntilMs };
    return { locked: false };
  } catch (err: unknown) {
    // Fail-open on DB errors: infrastructure hiccups must never lock out
    // legitimate users. The IP-level distributed rate limiter still applies.
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("checkRow failed (fail-open)", { message: msg });
    return { locked: false };
  }
}

/** Checks whether the given IP and/or user id is currently locked out. */
export async function getAuthLockStatus(p: { ip: string; userId?: number | null }): Promise<LockStatus> {
  const ipStatus = await checkRow(ipHashKey(p.ip));
  if (ipStatus.locked) return ipStatus;
  if (p.userId != null && Number.isFinite(p.userId)) {
    const userStatus = await checkRow(userHashKey(p.userId));
    if (userStatus.locked) return userStatus;
  }
  return { locked: false };
}

/**
 * Clears the failure counter for the authenticated user only.
 * The IP spray counter stays — a successful login on one account must not
 * reset attempts already recorded against other accounts from the same IP.
 */
export async function recordAuthLoginSuccess(p: { ip: string; userId?: number | null }): Promise<void> {
  if (p.userId == null || !Number.isFinite(p.userId)) return;
  await prisma.callbackQueue.deleteMany({
    where: { callbackType: "SEC_LOCK", callbackHash: userHashKey(p.userId) },
  });
}

async function bumpCounter(hash: string, userId: number | null): Promise<void> {
  const now = Date.now();
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.callbackQueue.findFirst({
        where: { callbackType: "SEC_LOCK", callbackHash: hash },
      });
      const prevData: Record<string, unknown> = isPlainRecord(row?.data) ? (row!.data as Record<string, unknown>) : {};
      if (Number(prevData.lockUntilMs ?? 0) > now) return; // already locked, don't extend

      const failCount = Number(prevData.failCount ?? 0) + 1;
      let lockUntilMs = 0;
      if (failCount >= TIER_SECOND) lockUntilMs = now + LOCK_MS_SECOND;
      else if (failCount >= TIER_FIRST) lockUntilMs = now + LOCK_MS_FIRST;

      const payload = { v: 1, failCount, lockUntilMs, lastFailAtMs: now };
      if (row?.id) {
        await tx.callbackQueue.update({
          where: { id: row.id },
          data: { data: payload, processedAt: new Date() },
        });
      } else {
        await tx.callbackQueue.create({
          data: {
            callbackType: "SEC_LOCK",
            callbackHash: hash,
            userId,
            data: payload,
            status: "processed",
            processedAt: new Date(),
          },
        });
      }
    });
  } catch (err: unknown) {
    // Losing a single failure count is acceptable; a 500 on login is not.
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("bumpCounter failed (skipping bump)", { message: msg });
  }
}

/** Records a failed login attempt for the given IP and (if resolved) user id. */
export async function recordAuthLoginFailure(p: { ip: string; userId?: number | null }): Promise<void> {
  const hasUserId = p.userId != null && Number.isFinite(p.userId);
  await bumpCounter(ipHashKey(p.ip), hasUserId ? (p.userId as number) : null);
  if (hasUserId) await bumpCounter(userHashKey(p.userId as number), p.userId as number);
}
