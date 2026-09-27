/**
 * Typed contracts and DTOs for the Read & Earn module.
 * Shared across server controllers, services, and client consumers.
 */
import type { ReadEarnRewardType } from "./read-earn.errors.js";

export interface ReadEarnRewardSnapshotDto {
  rewardType: ReadEarnRewardType | string;
  rewardAmount: number;
  rewardMinerId?: number | null;
  hashrateValidityDays?: number;
}

export interface ReadEarnCampaignDto {
  id: number;
  title: string;
  partnerUrl: string;
  rewardType: string;
  rewardAmount: number;
  rewardMinerId: number | null;
  hashrateValidityDays: number;
  startsAt: Date | string;
  expiresAt: Date | string;
  isActive: boolean;
  maxRedemptions: number | null;
  sortOrder: number;
  redemptionCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ReadEarnPublicCampaignDto {
  id: number;
  title: string;
  partnerUrl: string;
  startsAt: Date | string;
  expiresAt: Date | string;
}

export interface ReadEarnRedemptionUserDto {
  id: number;
  username?: string | null;
  email?: string | null;
}

export interface ReadEarnRedemptionDto {
  id: number;
  userId: number;
  username?: string | null;
  email?: string | null;
  rewardSnapshot: unknown;
  redeemedAt: Date | string;
  ip?: string | null;
}

export interface ReadEarnCampaignsApiResponse {
  ok: boolean;
  campaigns?: ReadEarnCampaignDto[];
  code?: string;
  message?: string;
}

export interface ReadEarnPublicCampaignsResponse {
  ok: boolean;
  campaigns?: ReadEarnPublicCampaignDto[];
  message?: string;
}

export interface ReadEarnRedemptionsApiResponse {
  ok: boolean;
  campaign?: { id: number; title: string };
  total?: number;
  take?: number;
  skip?: number;
  redemptions?: ReadEarnRedemptionDto[];
  message?: string;
}

export interface ReadEarnRedeemApiResponse {
  ok: boolean;
  code?: string;
  message?: string;
  reward?: ReadEarnRewardSnapshotDto;
}
