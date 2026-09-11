/** Ported from legacy/server/modules/faucet/faucet.types.ts. */
import type { Miner } from "@prisma/client";

export type FaucetRewardInfo = {
  rewardId: number;
  cooldownMs: number;
  miner: Miner;
};

export type FaucetStatusCore = {
  available: boolean;
  remainingMs: number;
  nextClaimAt: Date | null;
  totalClaims: number;
};

export type FaucetPartnerState = {
  hasFreshVisit: boolean;
  waitRemainingMs: number;
  partnerReady: boolean;
};
