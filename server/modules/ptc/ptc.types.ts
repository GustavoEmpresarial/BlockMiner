/** Ported from legacy/server/modules/ptc/{application,domain,infrastructure}/*.ts. */

/** No heartbeat / activity reference for this long -> cancel in-progress session. */
export const SESSION_STALE_MS = 90_000;

/** Max time to claim reward after session reaches `completed`. */
export const SESSION_CLAIM_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Max ms credited per heartbeat tick — prevents a single delayed heartbeat from crediting huge dead time (anti-cheat). */
export const HEARTBEAT_MAX_GAP_MS = 15_000;

export type PtpSessionOpenRow = {
  id: string;
  status: string;
  lastHeartbeatAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
};

export type CreateCampaignInput = {
  title: string;
  description: string;
  url: string;
  tierId: number;
  targetViews: number;
};

export type EditCampaignInput = {
  title?: string;
  description?: string;
  active?: boolean;
};

export type UpdateSettingsInput = {
  pricePerViewShib?: number;
  rewardPerViewShib?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  minViews?: number;
  maxViews?: number;
  isEnabled?: boolean;
};

export type CreateTierInput = {
  label: string;
  adType?: string;
  durationSeconds: number;
  pricePerViewShib: number;
  rewardPerViewShib: number;
  isActive?: boolean;
  sortOrder?: number;
};

export type UpdateTierInput = Partial<CreateTierInput>;
