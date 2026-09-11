// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
// Pure config/env + math helpers for the mining engine. No DB/socket/runtime state — the engine
// imports these. Kept separate so the reward/interval/allocation math is unit-testable without
// booting the engine.
//
// Faithful port of legacy/server/src/miningEngine.config.ts — no behavioral changes.
const DEFAULT_BLOCK_REWARD_POL = 0.3;
const DEFAULT_BLOCK_REWARD_SHIB = 69.44;
const DEFAULT_BLOCK_DURATION_MS = 10 * 60 * 1000;
/** Bps full POL allocation (100% POL → 0% SHIB). */
export const ALLOCATION_BPS_MAX = 10000;
/** POL minted per POL-pool block (shared by miners). Env overrides hardcoded default. */
export function readMiningBlockRewardPol() {
    const keys = ["MINING_POL_BLOCK_REWARD", "BLOCK_REWARD_POL", "BLOCKMINER_POL_BLOCK_REWARD"];
    for (const k of keys) {
        const raw = process.env[k];
        if (raw == null || String(raw).trim() === "")
            continue;
        const n = Number(String(raw).trim());
        if (Number.isFinite(n) && n > 0 && n <= 1_000_000)
            return n;
    }
    return DEFAULT_BLOCK_REWARD_POL;
}
/** SHIB minted per SHIB-pool block. Same per-block cadence as POL; pool split per-miner via allocation bps. */
export function readMiningBlockRewardShib() {
    const keys = ["MINING_SHIB_BLOCK_REWARD", "BLOCK_REWARD_SHIB", "BLOCKMINER_SHIB_BLOCK_REWARD"];
    for (const k of keys) {
        const raw = process.env[k];
        if (raw == null || String(raw).trim() === "")
            continue;
        const n = Number(String(raw).trim());
        if (Number.isFinite(n) && n > 0 && n <= 1_000_000_000)
            return n;
    }
    return DEFAULT_BLOCK_REWARD_SHIB;
}
/** Clamp allocation bps to [0, ALLOCATION_BPS_MAX] and round to nearest 500 (5% step). */
export function normalizeAllocationBps(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n))
        return ALLOCATION_BPS_MAX;
    const clamped = Math.max(0, Math.min(ALLOCATION_BPS_MAX, Math.round(n)));
    return Math.round(clamped / 500) * 500;
}
/** Interval between block settlements. Prefer minutes env; optional MS for fine control. */
export function readMiningBlockDurationMs() {
    const msRaw = process.env.MINING_BLOCK_INTERVAL_MS;
    if (msRaw != null && String(msRaw).trim() !== "") {
        const ms = Number(String(msRaw).trim());
        if (Number.isFinite(ms) && ms >= 60_000 && ms <= 86400000)
            return Math.round(ms);
    }
    const minKeys = ["MINING_BLOCK_INTERVAL_MINUTES", "BLOCK_INTERVAL_MINUTES", "BLOCKMINER_BLOCK_INTERVAL_MINUTES"];
    for (const k of minKeys) {
        const raw = process.env[k];
        if (raw == null || String(raw).trim() === "")
            continue;
        const m = Number(String(raw).trim());
        if (Number.isFinite(m) && m >= 1 && m <= 1440)
            return Math.round(m * 60 * 1000);
    }
    return DEFAULT_BLOCK_DURATION_MS;
}
/**
 * Next wall-clock boundary at or after `now`. The Unix epoch starts at midnight UTC, so any
 * interval that divides the day evenly (10min → :00 :10 :20 :30 :40 :50) lands on round clock
 * times. Always derived from the current instant, which is also what makes a restart — or an
 * outage spanning several boundaries — resume on the next boundary instead of replaying
 * missed blocks or drifting to an arbitrary offset.
 */
export function nextAlignedBoundary(now, intervalMs) {
    return Math.floor(now / intervalMs) * intervalMs + intervalMs;
}
/** P2002 on the unique `block_number` — the block is already committed, not a real failure. */
export function isDuplicateBlockError(error) {
    const code = error?.code;
    if (code !== "P2002")
        return false;
    const target = error?.meta?.target;
    const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
    return fields.includes("block_number") || fields.includes("blockNumber");
}
export function readBoundedIntegerEnv(name, fallback, minimum, maximum) {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isFinite(value))
        return fallback;
    return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}
