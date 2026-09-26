import { normalizePersistableMinerImageUrl } from "../inventory/inventory.types.js";
import type { FaucetRewardInfo } from "./faucet.types.js";

export interface StatusCoreRecord {
  claimedAt?: Date | null;
  totalClaims?: number;
}

export interface StatusCoreResult {
  available: boolean;
  remainingMs: number;
  nextClaimAt: Date | null;
  totalClaims: number;
}

export function buildStatusCore(
  record: StatusCoreRecord | null,
  now: Date,
  cooldownMs: number,
): StatusCoreResult {
  if (!record || !record.claimedAt) {
    return { available: true, remainingMs: 0, nextClaimAt: null, totalClaims: record?.totalClaims || 0 };
  }
  const nextClaimAt = new Date(record.claimedAt.getTime() + cooldownMs);
  const remainingMs = Math.max(0, nextClaimAt.getTime() - now.getTime());
  return { available: remainingMs === 0, remainingMs, nextClaimAt, totalClaims: record.totalClaims || 0 };
}

export function mapPublicReward(reward: FaucetRewardInfo, rewardDurationHours = 24) {
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
  return { ok: true as const, available: false, message: "No faucet reward configured.", canClaim: false, reward: null };
}
