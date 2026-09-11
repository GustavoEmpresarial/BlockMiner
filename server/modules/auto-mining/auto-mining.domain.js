/**
 * Pure domain logic for Auto Mining GPU v2 (no I/O).
 * Used for server-side validation — no side effects.
 */
import { V2_NORMAL_HASH_PER_CYCLE, V2_TURBO_HASH_PER_CYCLE, V2_CYCLE_SECONDS, V2_DAILY_LIMIT_HASH, V2_GRANT_TTL_MS, V2_CLICK_GRACE_MS, V2_MIN_CLICK_DELAY_MS, V2_HEARTBEAT_STALE_MS, V2_CLAIM_SECONDS_COST, V2_CLAIM_REQUIRED_SECONDS, } from "./auto-mining.config.js";
export function startOfUtcCalendarDay(now = new Date()) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
export function endOfUtcCalendarDay(now = new Date()) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
export function msUntilUtcDayReset(now = new Date()) {
    return Math.max(0, endOfUtcCalendarDay(now).getTime() - now.getTime());
}
export function utcDayDailyResetMeta(now = new Date()) {
    const utcDate = now.toISOString().slice(0, 10);
    return {
        timezone: "UTC",
        localDate: utcDate,
        nextResetAt: endOfUtcCalendarDay(now).toISOString(),
        nextResetInMs: msUntilUtcDayReset(now),
    };
}
export const MINING_MODES = Object.freeze({
    NORMAL: "NORMAL",
    TURBO: "TURBO",
});
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
export function startOfUtcDay(d) {
    return startOfUtcCalendarDay(d);
}
export function isClaimDue(nextClaimAt, serverNow, skewMs = 0) {
    return serverNow.getTime() >= nextClaimAt.getTime() - skewMs;
}
export function isHeartbeatStale(lastHeartbeatAt, serverNow, staleMs = HEARTBEAT_STALE_MS) {
    if (!lastHeartbeatAt)
        return true;
    return serverNow.getTime() - lastHeartbeatAt.getTime() > staleMs;
}
export function resolveClaimReadiness(input) {
    if (input.paused)
        return { ok: false, code: "SESSION_PAUSED" };
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
export function hasVerifiedPresence(autoMiningSecondsBalance, lastHeartbeatAt, serverNow, requiredSeconds = CLAIM_REQUIRED_SECONDS, staleMs = HEARTBEAT_STALE_MS) {
    if (autoMiningSecondsBalance < requiredSeconds)
        return false;
    return !isHeartbeatStale(lastHeartbeatAt, serverNow, staleMs);
}
export function canGrantDaily(currentDayTotalHash, grantAmount, limit = DAILY_LIMIT_HASH) {
    return currentDayTotalHash + grantAmount <= limit;
}
export function computeExpiresAt(earnedAt, ttlMs = GRANT_TTL_MS) {
    return new Date(earnedAt.getTime() + ttlMs);
}
export function validateImpressionForTurboClaim(impression, serverNow) {
    if (!impression.clickedAt)
        return { ok: false, code: "NOT_CLICKED" };
    if (impression.grantId != null)
        return { ok: false, code: "ALREADY_CLAIMED" };
    const clickDelay = impression.clickedAt.getTime() - impression.createdAt.getTime();
    if (clickDelay < MIN_CLICK_DELAY_MS)
        return { ok: false, code: "CLICK_TOO_FAST" };
    if (serverNow.getTime() - impression.createdAt.getTime() > CLICK_GRACE_MS) {
        return { ok: false, code: "IMPRESSION_EXPIRED" };
    }
    return { ok: true };
}
export function assertValidMiningMode(mode) {
    if (mode === MINING_MODES.NORMAL)
        return mode;
    const err = new Error("Invalid mining mode");
    err.code = "INVALID_MODE";
    throw err;
}
export function nextClaimAfterSuccess(serverNow, cycleSeconds = CYCLE_SECONDS) {
    return new Date(serverNow.getTime() + cycleSeconds * 1000);
}
export function hashRateForMode(mode) {
    return mode === MINING_MODES.TURBO ? TURBO_HASH_PER_CYCLE : NORMAL_HASH_PER_CYCLE;
}
