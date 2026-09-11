/**
 * Pure domain logic for Auto Mining GPU v2 (no I/O).
 * Used for server-side validation — no side effects.
 */
import {
  V2_NORMAL_HASH_PER_CYCLE,
  V2_TURBO_HASH_PER_CYCLE,
  V2_CYCLE_SECONDS,
  V2_DAILY_LIMIT_HASH,
  V2_GRANT_TTL_MS,
  V2_CLICK_GRACE_MS,
  V2_MIN_CLICK_DELAY_MS,
  V2_HEARTBEAT_STALE_MS,
  V2_CLAIM_SECONDS_COST,
  V2_CLAIM_REQUIRED_SECONDS,
} from "./auto-mining.config.js";

export function startOfUtcCalendarDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function endOfUtcCalendarDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export function msUntilUtcDayReset(now = new Date()): number {
  return Math.max(0, endOfUtcCalendarDay(now).getTime() - now.getTime());
}

export function utcDayDailyResetMeta(now = new Date()) {
  const utcDate = now.toISOString().slice(0, 10);
  return {
    timezone: "UTC" as const,
    localDate: utcDate,
    nextResetAt: endOfUtcCalendarDay(now).toISOString(),
    nextResetInMs: msUntilUtcDayReset(now),
  };
}

export const MINING_MODES = Object.freeze({
  NORMAL: "NORMAL",
  TURBO: "TURBO",
});

export type MiningMode = (typeof MINING_MODES)[keyof typeof MINING_MODES];

export const NORMAL_HASH_PER_CYCLE = V2_NORMAL_HASH_PER_CYCLE;
export const TURBO_HASH_PER_CYCLE = V2_TURBO_HASH_PER_CYCLE;
export const CYCLE_SECONDS = V2_CYCLE_SECONDS;
export const DAILY_LIMIT_HASH = V2_DAILY_LIMIT_HASH;
export const GRANT_TTL_MS = V2_GRANT_TTL_MS;
export const CLICK_GRACE_MS = V2_CLICK_GRACE_MS;
export const MIN_CLICK_DELAY_MS = V2_MIN_CLICK_DELAY_MS;
export const HEARTBEAT_STALE_MS = V2_HEARTBEAT_STALE_MS;
export const CLAIM_SECONDS_COST = V2_CLAIM_SECONDS_COST;
export const CLAIM_REQUIRED_SECONDS = V2_CLAIM_REQUIRED_SECONDS;

export function startOfUtcDay(d: Date): Date {
  return startOfUtcCalendarDay(d);
}

export function isClaimDue(nextClaimAt: Date, serverNow: Date, skewMs = 0): boolean {
  return serverNow.getTime() >= nextClaimAt.getTime() - skewMs;
}

export function isHeartbeatStale(
  lastHeartbeatAt: Date | null,
  serverNow: Date,
  staleMs = HEARTBEAT_STALE_MS,
): boolean {
  if (!lastHeartbeatAt) return true;
  return serverNow.getTime() - lastHeartbeatAt.getTime() > staleMs;
}

export type ClaimReadiness =
  | { ok: true }
  | { ok: false; code: "SESSION_PAUSED" }
  | { ok: false; code: "CLAIM_NOT_DUE"; retryAfterMs: number }
  | { ok: false; code: "PRESENCE_STALE"; retryAfterMs: number }
  | { ok: false; code: "PRESENCE_INSUFFICIENT"; secondsShort: number; retryAfterMs: number };

export function resolveClaimReadiness(input: {
  now: Date;
  nextClaimAt: Date;
  boosted: boolean;
  lastHeartbeatAt: Date | null;
  secondsBalance: number;
  paused: boolean;
  staleMs?: number;
  requiredSeconds?: number;
}): ClaimReadiness {
  if (input.paused) return { ok: false, code: "SESSION_PAUSED" };
  if (!isClaimDue(input.nextClaimAt, input.now)) {
    return {
      ok: false,
      code: "CLAIM_NOT_DUE",
      retryAfterMs: Math.max(0, input.nextClaimAt.getTime() - input.now.getTime()),
    };
  }
  if (!input.boosted && isHeartbeatStale(input.lastHeartbeatAt, input.now, input.staleMs)) {
    return { ok: false, code: "PRESENCE_STALE", retryAfterMs: input.staleMs ?? HEARTBEAT_STALE_MS };
  }
  const requiredSeconds = input.requiredSeconds ?? CLAIM_REQUIRED_SECONDS;
  if (!input.boosted && input.secondsBalance < requiredSeconds) {
    const secondsShort = requiredSeconds - input.secondsBalance;
    return { ok: false, code: "PRESENCE_INSUFFICIENT", secondsShort, retryAfterMs: secondsShort * 1000 };
  }
  return { ok: true };
}

export function hasVerifiedPresence(
  autoMiningSecondsBalance: number,
  lastHeartbeatAt: Date | null,
  serverNow: Date,
  requiredSeconds = CLAIM_REQUIRED_SECONDS,
  staleMs = HEARTBEAT_STALE_MS,
): boolean {
  if (autoMiningSecondsBalance < requiredSeconds) return false;
  return !isHeartbeatStale(lastHeartbeatAt, serverNow, staleMs);
}

export function canGrantDaily(
  currentDayTotalHash: number,
  grantAmount: number,
  limit = DAILY_LIMIT_HASH,
): boolean {
  return currentDayTotalHash + grantAmount <= limit;
}

export function computeExpiresAt(earnedAt: Date, ttlMs = GRANT_TTL_MS): Date {
  return new Date(earnedAt.getTime() + ttlMs);
}

export type TurboImpression = {
  clickedAt: Date | null;
  grantId: number | null;
  createdAt: Date;
};

export function validateImpressionForTurboClaim(
  impression: TurboImpression,
  serverNow: Date,
): { ok: true } | { ok: false; code: string } {
  if (!impression.clickedAt) return { ok: false, code: "NOT_CLICKED" };
  if (impression.grantId != null) return { ok: false, code: "ALREADY_CLAIMED" };
  const clickDelay = impression.clickedAt.getTime() - impression.createdAt.getTime();
  if (clickDelay < MIN_CLICK_DELAY_MS) return { ok: false, code: "CLICK_TOO_FAST" };
  if (serverNow.getTime() - impression.createdAt.getTime() > CLICK_GRACE_MS) {
    return { ok: false, code: "IMPRESSION_EXPIRED" };
  }
  return { ok: true };
}

export function assertValidMiningMode(mode: string): MiningMode {
  if (mode === MINING_MODES.NORMAL) return mode;
  const err = new Error("Invalid mining mode") as Error & { code: string };
  err.code = "INVALID_MODE";
  throw err;
}

export function nextClaimAfterSuccess(serverNow: Date, cycleSeconds = CYCLE_SECONDS): Date {
  return new Date(serverNow.getTime() + cycleSeconds * 1000);
}

export function hashRateForMode(mode: string): number {
  return mode === MINING_MODES.TURBO ? TURBO_HASH_PER_CYCLE : NORMAL_HASH_PER_CYCLE;
}
