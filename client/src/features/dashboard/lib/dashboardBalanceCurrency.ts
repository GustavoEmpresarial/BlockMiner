import { DASHBOARD_COIN_LOGO } from './dashboardCoinLogos';

export type DashboardBalanceCurrency = 'POL' | 'SHIB' | 'BLK';

export type DashboardWalletBalances = Record<DashboardBalanceCurrency, number>;

export const DASHBOARD_BALANCE_CURRENCIES: DashboardBalanceCurrency[] = ['POL', 'SHIB', 'BLK'];

export const DASHBOARD_BALANCE_CURRENCY_META: Record<
  DashboardBalanceCurrency,
  { nameKey: string; symbol: string; logoUrl: string | null; decimals: number }
> = {
  POL: { nameKey: 'dashboard.currency_pol', symbol: 'POL', logoUrl: DASHBOARD_COIN_LOGO.POL, decimals: 8 },
  SHIB: { nameKey: 'dashboard.currency_shib', symbol: 'SHIB', logoUrl: DASHBOARD_COIN_LOGO.SHIB, decimals: 4 },
  BLK: { nameKey: 'dashboard.currency_blk', symbol: 'BLK', logoUrl: DASHBOARD_COIN_LOGO.BLK, decimals: 4 },
};

const STORAGE_KEY_PREFIX = 'bm.dashboard.balanceCurrency';

function storageKey(userId: number | undefined): string {
  return `${STORAGE_KEY_PREFIX}:${userId ?? 'anon'}`;
}

function isBalanceCurrency(value: string | null): value is DashboardBalanceCurrency {
  return value != null && DASHBOARD_BALANCE_CURRENCIES.includes(value as DashboardBalanceCurrency);
}

export function readDashboardBalanceCurrency(userId: number | undefined): DashboardBalanceCurrency {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (isBalanceCurrency(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'POL';
}

export function writeDashboardBalanceCurrency(
  userId: number | undefined,
  currency: DashboardBalanceCurrency,
): void {
  try {
    localStorage.setItem(storageKey(userId), currency);
  } catch {
    /* ignore */
  }
}

export function emptyDashboardWalletBalances(): DashboardWalletBalances {
  return { POL: 0, SHIB: 0, BLK: 0 };
}
