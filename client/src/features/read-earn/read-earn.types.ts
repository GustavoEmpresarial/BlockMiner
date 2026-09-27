/**
 * Read & Earn client types — mirrors server contracts in server/modules/read-earn/read-earn.types.ts.
 */

export interface ReadEarnCampaignRow {
  id: number;
  title: string;
  partnerUrl: string;
  rewardType: string;
  rewardAmount: number;
  rewardMinerId?: number | null;
  hashrateValidityDays?: number;
  startsAt: string;
  expiresAt: string;
  maxRedemptions?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  redemptionCount?: number;
}

export interface ReadEarnPublicCampaign {
  id: number;
  title: string;
  expiresAt: string;
  partnerUrl: string;
}

export interface ReadEarnRedemptionRow {
  id: number;
  username?: string | null;
  email?: string | null;
  userId?: number;
  redeemedAt: string;
}

export interface ReadEarnCampaignsResponse {
  ok?: boolean;
  campaigns?: ReadEarnCampaignRow[];
  code?: string;
  message?: string;
}

export interface ReadEarnPublicCampaignsResponse {
  ok?: boolean;
  campaigns?: ReadEarnPublicCampaign[];
}

export interface ReadEarnRedemptionsResponse {
  ok?: boolean;
  campaign?: { id: number; title: string };
  redemptions?: ReadEarnRedemptionRow[];
  total?: number;
  take?: number;
  skip?: number;
  message?: string;
}

export interface ReadEarnRewardSnapshot {
  rewardType?: string;
  hashrateValidityDays?: number;
  rewardAmount?: number | string;
  rewardMinerId?: number | string;
}

export interface ReadEarnRedeemResponse {
  ok?: boolean;
  reward?: ReadEarnRewardSnapshot;
  code?: string;
  message?: string;
}

export interface MutateCampaignResponse {
  ok?: boolean;
  message?: string;
  code?: string;
}

export interface SaveCampaignBody {
  title: string;
  partnerUrl: string;
  rewardType: string;
  rewardAmount: number;
  hashrateValidityDays: number;
  startsAt: string;
  expiresAt: string;
  sortOrder: number;
  isActive: boolean;
  maxRedemptions?: number | null;
  rewardMinerId?: number | null;
  rewardCode?: string;
}
