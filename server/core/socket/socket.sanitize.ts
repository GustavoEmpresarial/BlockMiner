// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Sanitizes the mining engine's public state before it goes out over Socket.IO — never trust
 * the in-memory engine shape across versions. Ported verbatim (behavior-for-behavior) from
 * legacy/server/utils/socketStateSanitize.ts (`sanitizePublicStateForSocket`).
 */
const MAX_BLOCK_HISTORY = 48;
const MAX_USERNAME_LEN = 64;
const MAX_WALLET_LEN = 128;
const MAX_REF_LEN = 32;
function numSafe(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}
function sanitizeUsername(raw) {
    return String(raw ?? "")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .slice(0, MAX_USERNAME_LEN);
}
function sanitizeWallet(raw) {
    return String(raw ?? "")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .slice(0, MAX_WALLET_LEN);
}
function sanitizeRefCode(raw) {
    return String(raw ?? "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, MAX_REF_LEN);
}
function sanitizeBlockHistory(arr) {
    if (!Array.isArray(arr))
        return [];
    return arr.slice(0, MAX_BLOCK_HISTORY).map((raw) => {
        if (!raw || typeof raw !== "object") {
            return {
                blockNumber: 0,
                totalReward: 0,
                totalRewardShib: 0,
                userReward: 0,
                userRewardShib: 0,
                minerCount: 0,
                timestamp: Date.now(),
                persistFailed: false,
            };
        }
        const b = raw;
        const ts = b.timestamp != null
            ? typeof b.timestamp === "number"
                ? b.timestamp
                : Date.parse(String(b.timestamp))
            : Date.now();
        return {
            blockNumber: Math.trunc(numSafe(b.blockNumber, 0)),
            totalReward: numSafe(b.totalReward ?? b.reward, 0),
            totalRewardShib: numSafe(b.totalRewardShib ?? b.rewardShib, 0),
            userReward: numSafe(b.userReward, 0),
            userRewardShib: numSafe(b.userRewardShib, 0),
            minerCount: Math.trunc(numSafe(b.minerCount, 0)),
            timestamp: Number.isFinite(ts) ? ts : Date.now(),
            persistFailed: Boolean(b.persistFailed),
        };
    });
}
function sanitizeMiner(m) {
    if (!m || typeof m !== "object")
        return null;
    const rec = m;
    const allocBpsRaw = Math.trunc(numSafe(rec.miningAllocationPolBps, 10000));
    const allocBps = Math.max(0, Math.min(10000, allocBpsRaw));
    return {
        id: typeof rec.id === "string" ? rec.id.slice(0, 48) : rec.id != null ? String(rec.id).slice(0, 48) : undefined,
        username: sanitizeUsername(rec.username),
        walletAddress: rec.walletAddress == null ? null : sanitizeWallet(rec.walletAddress),
        rigs: Math.max(0, Math.trunc(numSafe(rec.rigs, 0))),
        active: Boolean(rec.active),
        balance: numSafe(rec.balance, 0),
        lifetimeMined: numSafe(rec.lifetimeMined, 0),
        connected: Boolean(rec.connected),
        estimatedHashRate: numSafe(rec.estimatedHashRate, 0),
        baseHashRate: numSafe(rec.baseHashRate, 0),
        activeTemporaryHashRate: numSafe(rec.activeTemporaryHashRate, 0),
        boostMultiplier: Math.min(1e6, Math.max(0, numSafe(rec.boostMultiplier, 1))),
        refCode: rec.refCode == null ? null : sanitizeRefCode(rec.refCode) || null,
        referralCount: Math.max(0, Math.trunc(numSafe(rec.referralCount, 0))),
        // Dual-pool mining fields
        miningAllocationPolBps: allocBps,
        lastShibReward: numSafe(rec.lastShibReward, 0),
        lifetimeMinedShib: numSafe(rec.lifetimeMinedShib, 0),
        shibBalance: numSafe(rec.shibBalance, 0),
    };
}
/** Returns a plain JSON-safe object for Socket.IO `state:update`-style payloads, or null if `raw` isn't shaped like public state. */
export function sanitizePublicStateForSocket(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
        return null;
    const s = raw;
    const miner = s.miner != null ? sanitizeMiner(s.miner) : null;
    const base = {
        serverTime: Math.trunc(numSafe(s.serverTime, Date.now())),
        tokenSymbol: String(s.tokenSymbol ?? "POL").slice(0, 8),
        tokenPrice: numSafe(s.tokenPrice, 0),
        blockReward: numSafe(s.blockReward, 0),
        blockRewardShib: numSafe(s.blockRewardShib, 0),
        blockIntervalMinutes: numSafe(s.blockIntervalMinutes, 0),
        blockNumber: Math.trunc(numSafe(s.blockNumber, 0)),
        blockProgress: numSafe(s.blockProgress, 0),
        blockCountdownSeconds: Math.max(0, Math.trunc(numSafe(s.blockCountdownSeconds, 0))),
        totalMiners: Math.max(0, Math.trunc(numSafe(s.totalMiners, 0))),
        activeMiners: Math.max(0, Math.trunc(numSafe(s.activeMiners, 0))),
        networkHashRate: numSafe(s.networkHashRate, 0),
        totalMinted: numSafe(s.totalMinted, 0),
        lastReward: numSafe(s.lastReward, 0),
        blockHistory: sanitizeBlockHistory(s.blockHistory),
        miner,
    };
    if (!Array.isArray(s.leaderboard)) {
        return base;
    }
    const leaderboard = s.leaderboard.slice(0, 50).map((row) => {
        if (!row || typeof row !== "object") {
            return { id: "", username: "?", rigs: 0, active: false, lifetimeMined: 0, currentHashRate: 0 };
        }
        const r = row;
        return {
            id: typeof r.id === "string" ? r.id.slice(0, 48) : String(r.id ?? "").slice(0, 48),
            username: sanitizeUsername(r.username),
            rigs: Math.max(0, Math.trunc(numSafe(r.rigs, 0))),
            active: Boolean(r.active),
            lifetimeMined: numSafe(r.lifetimeMined, 0),
            currentHashRate: numSafe(r.currentHashRate, 0),
        };
    });
    return { ...base, leaderboard };
}
