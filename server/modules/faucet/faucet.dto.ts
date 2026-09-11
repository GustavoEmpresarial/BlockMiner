// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { normalizePersistableMinerImageUrl } from "../inventory/inventory.types.js";
export function buildStatusCore(record, now, cooldownMs) {
    if (!record || !record.claimedAt) {
        return { available: true, remainingMs: 0, nextClaimAt: null, totalClaims: record?.totalClaims || 0 };
    }
    const nextClaimAt = new Date(record.claimedAt.getTime() + cooldownMs);
    const remainingMs = Math.max(0, nextClaimAt.getTime() - now.getTime());
    return { available: remainingMs === 0, remainingMs, nextClaimAt, totalClaims: record.totalClaims || 0 };
}
export function mapPublicReward(reward, rewardDurationHours = 24) {
    return {
        id: reward.rewardId,
        minerId: reward.miner.id,
        name: reward.miner.name,
        hashRate: reward.miner.baseHashRate,
        slotSize: reward.miner.slotSize,
        imageUrl: normalizePersistableMinerImageUrl(reward.miner.imageUrl) ?? null,
        inventoryPermanent: false,
        inventoryExpiresAt: null,
        rewardDurationHours,
    };
}
export function buildNoRewardStatusResponse() {
    return { ok: true, available: false, message: "No faucet reward configured.", canClaim: false, reward: null };
}
