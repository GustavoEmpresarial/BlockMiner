/** Ported from legacy/server/modules/faucet/faucet.types.ts. */
import type { Miner } from "@prisma/client";

export type FaucetRewardInfo = {
  rewardId: number;
  cooldownMs: number;
  miner: Miner;
};

export type FaucetPartnerState = {
  hasFreshVisit: boolean;
  waitRemainingMs: number;
  partnerReady: boolean;
};

export interface AdminFaucetRewardMiner {
  id: number;
  slug: string;
  name: string;
  baseHashRate: number;
  slotSize: number;
  imageUrl: string | null;
}

export interface AdminFaucetRewardDetail {
  rewardId: number;
  cooldownMs: number;
  isActive: boolean;
  miner: AdminFaucetRewardMiner;
}

export type AdminFaucetConfigResponse =
  | {
      ok: true;
      configured: true;
      reward: AdminFaucetRewardDetail;
    }
  | {
      ok: true;
      configured: false;
      reward: null;
    };

export interface AdminFaucetConfigInput {
  name?: string;
  baseHashRate?: number;
  imageUrl?: string | null;
  cooldownMs?: number;
  isActive?: boolean;
}

export interface AdminFaucetConfigUpdateResponse {
  ok: true;
  message?: string;
  reward: AdminFaucetRewardDetail;
}
