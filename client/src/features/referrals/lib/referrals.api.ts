import { api } from '../../../shared/auth/auth.store';

export interface ReferralDailyRow {
  date: string;
  pol: number | string;
  shib: number | string;
}

export interface ReferralUserRow {
  username: string;
  depositedPol: number | string;
  depositedUsd?: number | string | null;
  depositCount: number;
  earningsPol: number | string;
  earningsShib: number | string;
  transactionCount: number;
}

export interface ReferralStatsPayload {
  ok?: boolean;
  referralId: number;
  refCode: string;
  commissionRate: number;
  statsSince?: string;
  totals?: {
    referredUsers: number;
    depositedPol: number | string;
    depositedUsd?: number | string;
    earningsPol: number | string;
    earningsShib: number | string;
  };
  users?: ReferralUserRow[];
  daily?: ReferralDailyRow[];
}

export async function fetchReferralStats(): Promise<ReferralStatsPayload> {
  const res = await api.get<ReferralStatsPayload>('/user/referral-stats');
  return res.data;
}

export function buildReferralLink(referralId: number, refCode: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const code = refCode?.trim() || String(referralId);
  return `${origin}/register?ref=${encodeURIComponent(code)}`;
}

export function formatPolAmount(value: unknown, locale: string): string {
  const n = Number(value) || 0;
  if (n >= 1000) {
    return n.toLocaleString(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }
  if (n >= 1) {
    return n.toLocaleString(locale, { maximumFractionDigits: 4, minimumFractionDigits: 2 });
  }
  return n.toLocaleString(locale, { maximumFractionDigits: 6, minimumFractionDigits: 2 });
}

export function formatUsdAmount(value: unknown, locale: string): string {
  return (Number(value) || 0).toLocaleString(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

export function formatShibAmount(value: unknown, locale: string): string {
  return (Number(value) || 0).toLocaleString(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}
