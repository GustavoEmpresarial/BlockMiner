import { api } from '../../../shared/auth/auth.store';
import type {
  AnalyticsPayload,
  AnalyticsUserRef,
  DistributionResponse,
  ExecutiveResponse,
  InflationResponse,
  PeriodKey,
  ProjectionsResponse,
  WalletActivityPayload,
  WithdrawalsResponse,
} from './adminAnalytics.types';

export interface AnalyticsQueryParams {
  period: PeriodKey;
  userId?: number;
}

function buildQuery(params: AnalyticsQueryParams): string {
  const q = new URLSearchParams({ period: params.period });
  if (params.userId) {
    q.set('userId', String(params.userId));
  }
  return q.toString();
}

export const adminAnalyticsApi = {
  async getOverview(params: AnalyticsQueryParams): Promise<AnalyticsPayload> {
    const res = await api.get<AnalyticsPayload>(`/admin/analytics?${buildQuery(params)}`);
    return res.data;
  },

  async getInflation(params: AnalyticsQueryParams): Promise<InflationResponse> {
    const res = await api.get<InflationResponse>(`/admin/analytics/inflation?${buildQuery(params)}`);
    return res.data;
  },

  async getProjections(params: AnalyticsQueryParams): Promise<ProjectionsResponse> {
    const res = await api.get<ProjectionsResponse>(`/admin/analytics/projections?${buildQuery(params)}`);
    return res.data;
  },

  async getWithdrawals(params: AnalyticsQueryParams): Promise<WithdrawalsResponse> {
    const res = await api.get<WithdrawalsResponse>(`/admin/analytics/withdrawals?${buildQuery(params)}`);
    return res.data;
  },

  async getDistribution(params: AnalyticsQueryParams): Promise<DistributionResponse> {
    const res = await api.get<DistributionResponse>(`/admin/analytics/distribution?${buildQuery(params)}`);
    return res.data;
  },

  async getExecutive(period: PeriodKey): Promise<ExecutiveResponse> {
    const res = await api.get<ExecutiveResponse>(`/admin/analytics/executive?period=${period}`);
    return res.data;
  },

  async getTrackedWalletsActivity(): Promise<WalletActivityPayload> {
    const res = await api.get<WalletActivityPayload>('/admin/transparency/tracked-wallets/activity');
    return res.data;
  },

  async searchUsers(query: string, pageSize = 8): Promise<AnalyticsUserRef[]> {
    const clean = query.trim();
    if (!clean) return [];
    const res = await api.get<{ ok?: boolean; users?: AnalyticsUserRef[] }>(
      `/admin/users?pageSize=${pageSize}&q=${encodeURIComponent(clean)}`
    );
    return res.data.users ?? [];
  },
};
