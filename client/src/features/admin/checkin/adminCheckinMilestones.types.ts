export type AdminCheckinMilestone = {
  id: number;
  dayThreshold: number;
  rewardType: "pol" | "temporary_power" | "machine" | string;
  rewardValue: number;
  validityDays: number;
  displayTitle: string | null;
  description: string | null;
  active: boolean;
  sortOrder: number;
  minerId: number | null;
  minerName?: string | null;
  minerBaseHashRate?: number | null;
  minerImageUrl?: string | null;
  itemCode?: string | null;
  metadataJson?: { durationHours?: number } | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminCheckinMilestonesResponse = {
  ok: boolean;
  milestones: AdminCheckinMilestone[];
};

export type AdminCheckinMilestoneInput = {
  dayThreshold: number;
  rewardType: "pol" | "temporary_power" | "machine" | string;
  rewardValue: number;
  validityDays?: number;
  durationHours?: number;
  minerId?: number | null;
  active?: boolean;
  sortOrder?: number;
};

export type AdminStreakAnomaly = {
  userId: number;
  username: string | null;
  email: string;
  streak: number;
  checkinsInWindow: number;
  hasGraceGap: boolean;
  detectedAt?: string;
};

export type AdminStreakAnomaliesResponse = {
  ok: boolean;
  anomalyCount: number;
  anomalies: AdminStreakAnomaly[];
};

export type CatalogMinerOption = {
  id: number;
  name: string;
  baseHashRate?: number;
  hashRate?: number;
  imageUrl?: string | null;
};
