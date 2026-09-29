import type { Prisma } from "@prisma/client";

export type BurnEventOpenCheck = {
  isActive: boolean;
  deletedAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  stockTotal: number | null;
  stockClaimed: number;
};

export type BurnEventWithRewardMiner = Prisma.BurnEventGetPayload<{
  include: { rewardMiner: true };
}>;

export interface AdminCreateBurnEventInput {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  requiredHashRate: number;
  rewardMinerId: number;
  claimLimitPerUser?: number;
  stockTotal?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
}

export interface AdminUpdateBurnEventInput {
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  requiredHashRate?: number;
  rewardMinerId?: number;
  claimLimitPerUser?: number;
  stockTotal?: number | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive?: boolean;
}

export interface BurnClaimSummaryRow {
  id: number;
  eventId: number;
  userId: number;
  totalHashRate: number;
  rewardMinerName: string;
  claimedAt: Date;
  user?: {
    id: number;
    email: string;
    username?: string | null;
  };
}
