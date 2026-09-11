import { api } from '../../../shared/auth/auth.store';
import type { EarningsUiFilter } from './stats.config';
import { earningsFilterToApiPeriod } from './stats.config';

export type EarningsPeriod = '7d' | '30d' | '90d' | 'all';

export type EarningsTotals = {
  total: number;
  mining: number;
  offerwall: number;
  offerwallInternal: number;
  offerwallExternal: number;
  faucet: number;
  shortlinks: number;
  youtube: number;
  games: number;
  autoMining: number;
  checkin: number;
  referrals: number;
};

export type EarningsHistoryPoint = EarningsTotals & { date: string };

export type UserEarningsPayload = EarningsTotals & {
  ok?: true;
  referralStatsSince: string;
  period: EarningsPeriod;
  history: EarningsHistoryPoint[];
  powerMeta: {
    machineCount: number;
    activeBoosts: number;
    powerGained24h: number;
  };
  /** Optional meta for CSV export (when provided by API). */
  generatedAtUtc?: string;
  fromUtc?: string;
  toUtc?: string;
};

type EarningsErrorEnvelope = { ok: false; message?: string };

export type EarningsEnvelope = (UserEarningsPayload & { ok: true }) | EarningsErrorEnvelope;

export function formatPolAmount(value: number, locale?: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat(locale || 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: n >= 100 ? 2 : 8,
  }).format(n);
}

export async function fetchUserEarningsStats(filter: EarningsUiFilter): Promise<EarningsEnvelope> {
  const period = earningsFilterToApiPeriod(filter);
  const { data } = await api.get<EarningsEnvelope>('/stats/earnings', {
    params: { period },
  });
  return data;
}
