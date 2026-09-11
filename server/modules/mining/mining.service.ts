// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Orchestrates the engine singleton + repository. Exposes the functions the controller/admin
 * controller (and, later, a mining.cron.ts / mining.worker.ts) call.
 */
import { logger as rootLogger } from "../../core/logger/index.js";
import prisma from "../../core/database/prisma.js";
import { MiningEngine, ALLOCATION_BPS_MAX, normalizeAllocationBps } from "./mining.engine.js";
import * as miningRepo from "./mining.repository.js";
const logger = rootLogger.child("MiningService");
/** Process-wide engine singleton. One MiningEngine per Node process, same as legacy. */
export const engine = new MiningEngine();
let bootstrapped = false;
engine.setProfileLoader(async (userId) => {
    try {
        return await miningRepo.getOrCreateMinerProfile(userId);
    }
    catch {
        return null;
    }
});
engine.setPersistBlockRewardsCallback(async (payload) => {
    await miningRepo.persistBlockRewards(payload);
});
/**
 * Eagerly preloads every non-banned user's miner into the in-memory engine at boot.
 *
 * Real bug found 12/08/2026 (PROGRESSO.txt item 65): this call never existed in current/'s
 * bootstrapEngine() — `engine.miners` was only ever populated lazily, one user at a time, the
 * first time each user hit an authenticated endpoint (getOrCreateEngineMinerForUser). That means
 * on every process restart `engine.miners` starts EMPTY and stays that way for anyone who hasn't
 * made an authenticated request yet — so a block settling minutes after boot only pays out the
 * handful of users who happened to already load, instead of the whole real userbase, even though
 * their machines are installed and their session is perfectly valid. Ported from legacy/server.ts
 * `syncEngineMiners()` (called right after block-number continuity in legacy's own
 * `bootstrapEngine`), batched with the same bounded concurrency to avoid opening thousands of
 * concurrent DB connections against ~2700 real users in one process tick.
 */
async function syncEngineMiners() {
    try {
        const users = await prisma.user.findMany({ where: { isBanned: false }, select: { id: true } });
        const concurrency = Math.min(32, Math.max(1, Math.floor(Number(process.env.MINING_ENGINE_BOOT_CONCURRENCY || 12))));
        logger.info(`Syncing ${users.length} users into mining engine (concurrency=${concurrency})...`);
        for (let i = 0; i < users.length; i += concurrency) {
            const batch = users.slice(i, i + concurrency);
            await Promise.all(batch.map(async (user) => {
                try {
                    const profile = await miningRepo.getOrCreateMinerProfile(user.id);
                    if (profile.base_hash_rate > 0) {
                        engine.createOrGetMiner({
                            userId: user.id,
                            username: profile.username ?? null,
                            walletAddress: profile.walletAddress ?? null,
                            profile: {
                                rigs: profile.rigs,
                                base_hash_rate: profile.base_hash_rate,
                                balance: profile.balance,
                                shib_balance: profile.shib_balance,
                                lifetimeMined: profile.lifetime_mined,
                                refCode: profile.refCode,
                                referralCount: profile.referralCount,
                                mining_payout_mode: profile.mining_payout_mode,
                                mining_allocation_pol_bps: profile.mining_allocation_pol_bps,
                            },
                        });
                    }
                }
                catch (error) {
                    logger.error("Failed to sync one user into mining engine", {
                        userId: user.id,
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }));
        }
        logger.info("Engine sync complete.");
    }
    catch (error) {
        logger.error("Failed to sync engine miners", { error: error instanceof Error ? error.message : String(error) });
    }
}
/** Boots block-number continuity from the DB. Call once at process startup (bootstrap/server.ts wires this). */
export async function bootstrapEngine() {
    if (bootstrapped)
        return;
    bootstrapped = true;
    try {
        const blocks = await miningRepo.loadRecentBlocks(12);
        engine.blockHistory = blocks;
        const currentMax = await miningRepo.loadMaxBlockNumber();
        engine.blockNumber = currentMax + 1;
        logger.info("Engine bootstrap complete", { currentMax, nextBlock: engine.blockNumber });
        await syncEngineMiners();
    }
    catch (error) {
        logger.error("Failed to bootstrap mining engine", { error: error instanceof Error ? error.message : String(error) });
    }
}
/** Gets (or lazily creates) the in-memory miner for a user, loading its DB profile first. */
export async function getOrCreateEngineMinerForUser(userId) {
    const existing = engine.findMinerByUserId(userId);
    if (existing)
        return existing;
    const profile = await miningRepo.getOrCreateMinerProfile(userId);
    return engine.createOrGetMiner({
        userId,
        username: profile.username ?? null,
        walletAddress: profile.walletAddress ?? null,
        profile: {
            rigs: profile.rigs,
            base_hash_rate: profile.base_hash_rate,
            balance: profile.balance,
            shib_balance: profile.shib_balance,
            lifetimeMined: profile.lifetime_mined,
            refCode: profile.refCode,
            referralCount: profile.referralCount,
            mining_payout_mode: profile.mining_payout_mode,
            mining_allocation_pol_bps: profile.mining_allocation_pol_bps,
        },
    });
}
/**
 * Recomputes a user's total hashrate from the DB (machines + every active temporary power
 * grant, see mining.repository.ts `computeBaseHashRate`) AND pushes it into the live
 * in-memory engine if that user is already loaded there.
 *
 * Real bug fixed 12/08/2026 (PROGRESSO.txt item 74): `mining/index.ts` used to re-export
 * `miningRepo.syncUserBaseHashRate` directly — a pure DB compute with no engine side effect.
 * Half a dozen acquisition modules (youtube, partner-games, internal-offerwall, mini-pass,
 * burn-events) call this after granting temporary power expecting it to take effect
 * immediately (matching their own doc comments, and matching the one place — games.socket.ts —
 * that had manually duplicated the "look up the live miner, set baseHashRate" step inline).
 * Centralizing that step here, behind the same public name, fixes all of them in one place
 * instead of patching each call site's duplicate of the same two lines. No-op (computes and
 * discards) for a user not currently loaded in the engine — correct: they'll get the fresh
 * total the next time they're lazily loaded (getOrCreateEngineMinerForUser reads the DB fresh).
 */
export async function syncUserBaseHashRate(userId) {
    const hashRate = await miningRepo.syncUserBaseHashRate(userId);
    const miner = engine.findMinerByUserId(userId);
    if (miner)
        miner.baseHashRate = hashRate;
    return hashRate;
}
/** GET /mining/cycle — public read-only snapshot (poll-only; no socket broadcast in this phase). */
export async function getCycleSnapshotForUser(userId) {
    let minerId;
    if (userId) {
        const miner = await getOrCreateEngineMinerForUser(userId);
        minerId = miner.id;
    }
    return engine.getPublicState(minerId, { includeLeaderboard: true });
}
/** GET /mining/reward-rate — authenticated user's current hashrate + estimated reward. */
export async function getRewardRateForUser(userId) {
    const hashRate = await miningRepo.syncUserBaseHashRate(userId);
    const miner = await getOrCreateEngineMinerForUser(userId);
    miner.baseHashRate = hashRate;
    const state = engine.getPublicState(miner.id);
    return {
        userHashrate: hashRate,
        blockReward: state.blockReward,
        blockRewardShib: state.blockRewardShib,
        networkHashRate: state.networkHashRate,
        estimatedHashShare: state.networkHashRate > 0 ? hashRate / state.networkHashRate : 0,
        miningAllocationPolBps: miner.miningAllocationPolBps,
    };
}
/** PATCH /mining/allocation — validate, persist to DB, then apply to the live engine miner. */
export async function updateUserAllocation(userId, rawPolBps) {
    if (typeof rawPolBps !== "number" && typeof rawPolBps !== "string") {
        return { ok: false, reason: "invalid_type" };
    }
    const parsed = Number(rawPolBps);
    if (!Number.isFinite(parsed)) {
        return { ok: false, reason: "invalid_number" };
    }
    if (parsed < 0 || parsed > ALLOCATION_BPS_MAX) {
        return { ok: false, reason: "out_of_range" };
    }
    const polBps = normalizeAllocationBps(parsed);
    const shibBps = ALLOCATION_BPS_MAX - polBps;
    await miningRepo.updateUserMiningAllocation(userId, polBps);
    const miner = engine.findMinerByUserId(userId);
    if (miner) {
        engine.setMinerAllocation(miner.id, polBps);
    }
    else {
        logger.warn("updateAllocation: miner not found in engine — DB updated, will apply on next connect", { userId });
    }
    return { ok: true, polBps, shibBps };
}
/** PATCH /mining/payout-mode — POL block mining vs BLK time-pool cycles (mutually exclusive). */
export async function updateUserPayoutMode(userId, rawMode) {
    const mode = String(rawMode ?? "").toLowerCase();
    if (mode !== "pol" && mode !== "blk") {
        return { ok: false, reason: "invalid_mode" };
    }
    await miningRepo.updateUserMiningPayoutMode(userId, mode);
    const miner = engine.findMinerByUserId(userId);
    if (miner) {
        miner.miningPayoutMode = mode;
    }
    else {
        logger.warn("updatePayoutMode: miner not found in engine — DB updated, will apply on next connect", { userId });
    }
    return { ok: true, mode };
}
/** POST /mining/boost — apply the 30s x1.25 boost. Persists the balance delta on success. */
export async function applyBoostForUser(userId) {
    const miner = await getOrCreateEngineMinerForUser(userId);
    const result = engine.applyBoost(miner.id);
    if (result.ok) {
        miner.lastPersistedBalance = await miningRepo.persistMinerBalanceDelta(userId, miner.balance, miner.lastPersistedBalance);
    }
    return result;
}
/** POST /mining/upgrade-rig — buy the next rig slot. Persists the balance delta on success. */
export async function upgradeRigForUser(userId) {
    const miner = await getOrCreateEngineMinerForUser(userId);
    const result = engine.upgradeRig(miner.id);
    if (result.ok) {
        miner.lastPersistedBalance = await miningRepo.persistMinerBalanceDelta(userId, miner.balance, miner.lastPersistedBalance);
    }
    return result;
}
/** Admin manual trigger: force-settle the current block immediately (same math as a natural tick). */
export async function adminRunBlockCycle() {
    const minedBlockNumber = engine.blockNumber;
    engine.distributeRewards();
    await engine.drainSettlements();
    return { blockNumber: minedBlockNumber };
}
/** Called by cron (mining.cron.ts, wired in a later integration pass) once per tick interval. */
export async function runEngineTick() {
    await engine.tickAsync();
}
