export interface CatalogMiner {
  id: number;
  name: string;
  imageUrl: string | null;
  baseHashRate: number;
  slotSize: number;
}

export interface AdminBurnEventRow {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  requiredHashRate: number;
  rewardMinerId: number;
  claimLimitPerUser: number;
  stockTotal: number | null;
  stockClaimed: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  rewardMiner: CatalogMiner;
  _count: { claims: number };
}

export interface AdminCreateBurnEventPayload {
  title: string;
  description?: string;
  imageUrl?: string;
  requiredHashRate: number;
  rewardMinerId: number;
  claimLimitPerUser?: number;
  stockTotal?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
}

export interface AdminUpdateBurnEventPayload {
  title?: string;
  description?: string | null;
  imageUrl?: string | null;
  requiredHashRate?: number;
  rewardMinerId?: number;
  claimLimitPerUser?: number;
  stockTotal?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
}

export interface AdminBurnClaimRow {
  id: number;
  eventId: number;
  userId: number;
  totalHashRate: number;
  rewardMinerName: string;
  claimedAt: string;
  user?: {
    id: number;
    email: string;
    username?: string | null;
  };
}

export interface AdminBurnEventsListResponse {
  ok: boolean;
  events?: AdminBurnEventRow[];
  message?: string;
}

export interface AdminBurnEventDetailResponse {
  ok: boolean;
  event?: AdminBurnEventRow;
  message?: string;
}

export interface AdminBurnEventClaimsResponse {
  ok: boolean;
  claims?: AdminBurnClaimRow[];
  total?: number;
  page?: number;
  limit?: number;
  message?: string;
}
