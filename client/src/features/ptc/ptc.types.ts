/**
 * Shared PTC types and DTOs for frontend features.
 * Mirrors server/modules/ptc/ptc.types.ts.
 */

export type PtcCurrency = 'SHIB' | 'POL' | 'BLK';
export const PTC_SUPPORTED_CURRENCIES: readonly PtcCurrency[] = ['SHIB', 'POL', 'BLK'] as const;

export interface PtcSettings {
  pricePerViewShib: string | number;
  rewardPerViewShib: string | number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  minViews: number;
  maxViews: number;
  isEnabled: boolean;
}

export interface PtcTier {
  id: number;
  label: string;
  adType: 'window' | 'iframe';
  durationSeconds: number;
  pricePerViewShib: string | number;
  rewardPerViewShib: string | number;
  currency?: PtcCurrency;
  isActive: boolean;
  sortOrder: number;
}

export interface PtcCampaignUser {
  id: number;
  name: string;
  email: string;
}

export interface PtcCampaign {
  id: number;
  userId?: number;
  title: string;
  description: string;
  url: string;
  adType: 'iframe' | 'window';
  durationSeconds: number;
  status: 'pending_approval' | 'rejected' | 'active' | 'paused' | 'completed';
  rejectionReason: string | null;
  views: number;
  targetViews: number;
  costShib: string;
  rewardPerViewShib: string;
  asset?: PtcCurrency | string;
  createdAt: string;
  user?: PtcCampaignUser;
}

export interface PtcAd {
  id: number;
  title: string;
  description?: string;
  url: string;
  adType: 'iframe' | 'window';
  durationSeconds: number;
  rewardPerViewShib: string;
  views?: number;
  targetViews?: number;
  viewedToday?: boolean;
  availableToday?: boolean;
}

export interface PtcDailyReset {
  utcDate: string;
  nextResetAt: string;
  nextResetInMs: number;
}

export interface SessionApiResponse {
  id: string;
  status: string;
  accumulatedMs: number;
  ad: PtcAd;
}

export interface PtcSettingsApiResponse {
  ok: boolean;
  settings?: PtcSettings;
  message?: string;
}

export interface PtcTiersApiResponse {
  ok: boolean;
  tiers?: PtcTier[];
  tier?: PtcTier;
  message?: string;
}

export interface PtcCampaignsApiResponse {
  ok: boolean;
  campaigns?: PtcCampaign[];
  items?: PtcCampaign[];
  total?: number;
  page?: number;
  limit?: number;
  message?: string;
}
