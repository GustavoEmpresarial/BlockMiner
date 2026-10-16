import { api } from '../../../shared/auth/auth.store';

export type ActivityCategory =
  | 'all'
  | 'purchases'
  | 'machines'
  | 'youtube'
  | 'faucet'
  | 'shortlinks'
  | 'ptc'
  | 'offerwall'
  | 'auto_mining'
  | 'games'
  | 'checkin'
  | 'boosts'
  | 'finance'
  | 'account'
  | 'general';

export type ActivityHistoryDays = 1 | 7 | 30;

export interface ActivityCategorySummary {
  id: ActivityCategory;
  label: string;
  count: number;
}

export interface UserActivityLogItem {
  id: number;
  action: string;
  category: ActivityCategory;
  categoryLabel: string;
  title: string;
  description: string;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface UserActivityHistoryResponse {
  ok: boolean;
  logs: UserActivityLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  categories: ActivityCategorySummary[];
  categoryCounts: Record<string, number>;
  windowDays: number;
}

export interface FetchUserActivityHistoryParams {
  page?: number;
  pageSize?: number;
  category?: string;
  q?: string;
  days?: ActivityHistoryDays;
}

export async function fetchUserActivityHistory(
  params: FetchUserActivityHistoryParams = {},
  signal?: AbortSignal,
): Promise<UserActivityHistoryResponse> {
  const res = await api.get<UserActivityHistoryResponse>('/stats/activity-history', {
    params,
    signal,
  });
  return res.data;
}
