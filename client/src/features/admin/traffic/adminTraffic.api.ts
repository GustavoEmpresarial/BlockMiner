import { api } from '../../../shared/auth/auth.store';
import type {
  AdminTrafficDailyRow,
  AdminTrafficDomainRow,
  AdminTrafficSummary,
  AdminTrafficUtmRow,
} from './adminTraffic.types';

export interface AdminTrafficFullData {
  summary: AdminTrafficSummary;
  daily: AdminTrafficDailyRow[];
  domains: AdminTrafficDomainRow[];
  utm: AdminTrafficUtmRow[];
}

export const adminTrafficApi = {
  async getSummary(days = 30): Promise<AdminTrafficSummary> {
    const res = await api.get<AdminTrafficSummary & { ok: boolean }>(`/admin/traffic/summary?days=${days}`);
    return res.data;
  },

  async getDaily(days = 30): Promise<AdminTrafficDailyRow[]> {
    const res = await api.get<{ ok: boolean; rows: AdminTrafficDailyRow[] }>(`/admin/traffic/daily?days=${days}`);
    return res.data.rows ?? [];
  },

  async getByDomain(days = 30): Promise<AdminTrafficDomainRow[]> {
    const res = await api.get<{ ok: boolean; rows: AdminTrafficDomainRow[] }>(`/admin/traffic/by-domain?days=${days}`);
    return res.data.rows ?? [];
  },

  async getByUtm(days = 30): Promise<AdminTrafficUtmRow[]> {
    const res = await api.get<{ ok: boolean; rows: AdminTrafficUtmRow[] }>(`/admin/traffic/by-utm?days=${days}`);
    return res.data.rows ?? [];
  },

  async getAll(days = 30): Promise<AdminTrafficFullData> {
    const [summaryRes, dailyRes, domainsRes, utmRes] = await Promise.all([
      api.get<AdminTrafficSummary & { ok: boolean }>(`/admin/traffic/summary?days=${days}`),
      api.get<{ ok: boolean; rows: AdminTrafficDailyRow[] }>(`/admin/traffic/daily?days=${days}`),
      api.get<{ ok: boolean; rows: AdminTrafficDomainRow[] }>(`/admin/traffic/by-domain?days=${days}`),
      api.get<{ ok: boolean; rows: AdminTrafficUtmRow[] }>(`/admin/traffic/by-utm?days=${days}`),
    ]);

    const summary = summaryRes.data;
    const daily = dailyRes.data.rows ?? [];
    const domains = domainsRes.data.rows ?? [];
    const utm = utmRes.data.rows ?? [];

    const effectiveDays = Math.max(days, 1);
    const avgDailyHits = Math.round((summary.periodHits / effectiveDays) * 10) / 10;
    const avgDailyRegs = Math.round((summary.periodRegs / effectiveDays) * 10) / 10;

    return {
      summary: {
        ...summary,
        avgDailyHits,
        avgDailyRegs,
      },
      daily,
      domains,
      utm,
    };
  },
};
