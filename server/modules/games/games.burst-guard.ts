/**
 * Ported from legacy/server/modules/games/gameBurstGuard.ts.
 * Flags parallel-finish patterns; when rejectOnBurst is true, callers must deny reward.
 */
import prisma from "../../core/database/prisma.js";

const burstAuditDedupeUntil = new Map<string, number>();

/** Same-second duplicate successful finish → burst. */
export const BURST_SAME_SECOND_MIN = 1;
/** Successful rewarded finishes in the last minute → burst. */
export const BURST_LAST_MINUTE_MIN = 3;

function burstAuditDedupeKey(userId: number, gameSlug: string, now: Date): string {
  const minute = Math.floor(now.getTime() / 60_000);
  return `${userId}:${gameSlug}:${minute}`;
}

function pruneBurstAuditDedupe(nowMs: number): void {
  if (burstAuditDedupeUntil.size < 500) return;
  for (const [key, until] of burstAuditDedupeUntil) {
    if (until <= nowMs) burstAuditDedupeUntil.delete(key);
  }
}

function shouldWriteBurstAudit(userId: number, gameSlug: string, now: Date): boolean {
  const nowMs = now.getTime();
  pruneBurstAuditDedupe(nowMs);
  const key = burstAuditDedupeKey(userId, gameSlug, now);
  const until = burstAuditDedupeUntil.get(key);
  if (until != null && until > nowMs) return false;
  burstAuditDedupeUntil.set(key, nowMs + 60_000);
  return true;
}

/** Test-only: whether a burst audit would be written (mutates dedupe state like production). */
export function __testBurstAuditDedupeWouldWrite(userId: number, gameSlug: string, now = new Date()): boolean {
  return shouldWriteBurstAudit(userId, gameSlug, now);
}

/** Test-only: reset in-memory dedupe state. */
export function _resetBurstAuditDedupeForTests(): void {
  burstAuditDedupeUntil.clear();
}

export type BurstCheckResult = { suspicious: boolean; reason: string | null; sameSecondCount: number; lastMinuteCount: number };

export async function checkMinigameBurstPattern(userId: number, gameSlug: string, now = new Date()): Promise<BurstCheckResult> {
  const minuteAgo = new Date(now.getTime() - 60_000);
  const secondStart = new Date(Math.floor(now.getTime() / 1000) * 1000);

  const [lastMinuteCount, sameSecondCount] = await Promise.all([
    prisma.gameSessionLog.count({ where: { userId, gameSlug, success: true, rewardGranted: true, createdAt: { gte: minuteAgo, lt: now } } }),
    prisma.gameSessionLog.count({ where: { userId, gameSlug, success: true, rewardGranted: true, createdAt: { gte: secondStart, lt: now } } }),
  ]);

  if (sameSecondCount >= BURST_SAME_SECOND_MIN) {
    return { suspicious: true, reason: "same_second_finish", sameSecondCount, lastMinuteCount };
  }
  if (lastMinuteCount >= BURST_LAST_MINUTE_MIN) {
    return { suspicious: true, reason: "minute_volume_high", sameSecondCount, lastMinuteCount };
  }
  return { suspicious: false, reason: null, sameSecondCount, lastMinuteCount };
}

export async function flagMinigameBurstIfNeeded(
  userId: number,
  gameSlug: string,
  meta: { ip?: string | null; userAgent?: string | null; score?: number; playTimeMs?: number },
  now = new Date(),
): Promise<BurstCheckResult> {
  const burst = await checkMinigameBurstPattern(userId, gameSlug, now);
  if (!burst.suspicious) return burst;
  if (!shouldWriteBurstAudit(userId, gameSlug, now)) return burst;

  await prisma.auditLog
    .create({
      data: {
        userId,
        action: "MINIGAME_BURST_SUSPECT",
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        detailsJson: JSON.stringify({
          gameSlug,
          reason: burst.reason,
          sameSecondCount: burst.sameSecondCount,
          lastMinuteCount: burst.lastMinuteCount,
          score: meta.score ?? null,
          playTimeMs: meta.playTimeMs ?? null,
        }),
      },
    })
    .catch(() => undefined);

  return burst;
}

/** Cooldown seconds after a burst reject. */
export function burstRejectCooldownSec(): number {
  const raw = Number(process.env.GAME_BURST_REJECT_COOLDOWN_SEC);
  if (!Number.isFinite(raw) || raw <= 0) return 90;
  return Math.floor(raw);
}
