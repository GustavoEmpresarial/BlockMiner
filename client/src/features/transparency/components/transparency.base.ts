import {
  Server,
  Wrench,
  Megaphone,
  Users,
  Scale,
  Package,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** Known investment wallet — DeBank link + optional on-chain breakdown. */
export const INVESTMENT_WALLET_ADDRESS = '0x454d8a4261155621f603A275bB69B381d0513202';
/** Legacy deposit wallet — always shown as deprecated in the portal. */
export const OLD_DEPOSIT_WALLET_ADDRESS = '0x1CA03755C5132e238aE4E0f50d4929EA0D58b897';
/** Legacy withdrawal wallet — historical outflows only, excluded from treasury KPI. */
export const OLD_WITHDRAWAL_WALLET_ADDRESS = '0x404CBeC8eC6F59e28C5F3D9e5b6080DA344792E7';

const LEGACY_WALLET_ADDRESSES = new Set([
  OLD_DEPOSIT_WALLET_ADDRESS.toLowerCase(),
  OLD_WITHDRAWAL_WALLET_ADDRESS.toLowerCase(),
]);

export function isLegacyWallet(wallet: Pick<TrackedWalletEntry, 'address' | 'isActive'>): boolean {
  if (wallet.isActive === false) return true;
  return LEGACY_WALLET_ADDRESSES.has(wallet.address.toLowerCase());
}

/** Wallets that contribute to the treasury KPI (Tesouraria) at the top of the page. */
export function walletCountsInTreasury(
  wallet: Pick<TrackedWalletEntry, 'address' | 'isActive' | 'includeInTotals'>,
): boolean {
  if (isLegacyWallet(wallet)) return false;
  return wallet.includeInTotals !== false;
}

export function walletTreasuryUsd(wallet: TrackedWalletEntry): number {
  if (!walletCountsInTreasury(wallet)) return 0;
  const n = Number(wallet.valueUsd ?? wallet.totalUsd ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

const viteEnv =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as Record<string, string | undefined>)
    : {};

export const WALLETS_POLL_INTERVAL_MS = readPositiveInt(
  viteEnv.VITE_TRANSPARENCY_WALLETS_POLL_MS,
  12_000,
);
export const WALLETS_MAX_RETRIES = readPositiveInt(
  viteEnv.VITE_TRANSPARENCY_WALLETS_MAX_RETRIES,
  10,
);

export const CATEGORY_ORDER = [
  'infrastructure',
  'tooling',
  'marketing',
  'payroll',
  'legal',
  'misc',
] as const;

export type CategoryKey = (typeof CATEGORY_ORDER)[number];

export const CATEGORY_ICONS: Record<CategoryKey, LucideIcon> = {
  infrastructure: Server,
  tooling: Wrench,
  marketing: Megaphone,
  payroll: Users,
  legal: Scale,
  misc: Package,
};

export const CATEGORY_STYLE: Record<
  CategoryKey,
  { color: string; tw: string; bg: string; border: string }
> = {
  infrastructure: { color: '#60a5fa', tw: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  tooling: { color: '#c084fc', tw: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  marketing: { color: '#f472b6', tw: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20' },
  payroll: { color: '#fbbf24', tw: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  legal: { color: '#34d399', tw: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  misc: { color: '#9ca3af', tw: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20' },
};

export const INCOME_STYLE = {
  revenue: { color: '#34d399', bg: 'bg-emerald-500/15', tw: 'text-emerald-400' },
  sponsorship: { color: '#60a5fa', bg: 'bg-blue-500/15', tw: 'text-blue-400' },
  donation: { color: '#f472b6', bg: 'bg-pink-500/15', tw: 'text-pink-400' },
  investment_return: { color: '#a78bfa', bg: 'bg-violet-500/15', tw: 'text-violet-400' },
  other: { color: '#9ca3af', bg: 'bg-gray-500/15', tw: 'text-gray-400' },
} as const;

export type TransparencyEntry = {
  id: number;
  type?: string;
  category: string;
  incomeCategory?: string | null;
  name: string;
  description?: string | null;
  provider?: string | null;
  providerUrl?: string | null;
  imageUrl?: string | null;
  amountUsd: number | string;
  amountOriginal?: number | string | null;
  currencyCode?: string | null;
  fxRateUsd?: number | string | null;
  period: string;
  isPaid?: boolean;
  isOnChain?: boolean;
  blockchain?: string | null;
  walletAddress?: string | null;
  txHash?: string | null;
  direction?: string | null;
  updatedAt: string;
};

export type TransparencyApiResponse = {
  ok: boolean;
  entries?: TransparencyEntry[];
  message?: string;
};

export type ChainSnapshotEntry = {
  chainId: number;
  name: string;
  nativeBalance: number;
  nativeSymbol: string;
  tokens: Array<{ symbol?: string; usdValue?: number | null }>;
  totalChainUsd?: number | null;
  lpUsd?: number | null;
};

export type TokenSnapshotEntry = {
  symbol?: string;
  usdValue?: number | null;
};

export type LiquidityPoolEntry = {
  id?: number;
  chainId: number;
  chainName: string;
  contractAddress: string;
  tokenId: string;
  poolLabel?: string | null;
  name?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  explorerUrl: string;
  openseaUrl?: string;
  liquidityUsd?: number | null;
  status: string;
};

export type TrackedWalletEntry = {
  id?: number;
  label?: string;
  address: string;
  chain?: string;
  assetSymbol?: string;
  explorerBaseUrl?: string | null;
  displayMode?: string;
  isActive?: boolean;
  includeInTotals?: boolean;
  manualUsdValue?: number | null;
  manualValueNote?: string | null;
  warming?: boolean;
  totalUsd?: number | null;
  valueUsd?: number | null;
  valuePol?: number | null;
  chains?: ChainSnapshotEntry[];
  tokens?: TokenSnapshotEntry[];
  nfts?: unknown[];
  fetchedAt?: string | null;
  liquidityPools?: LiquidityPoolEntry[];
};

export type WalletsLiveResponse = {
  ok: boolean;
  warming?: boolean;
  polUsdPrice?: number | null;
  wallets?: TrackedWalletEntry[];
};

export type DisplayModeKey = 'total_received' | 'current_balance' | 'total_sent';

export const DISPLAY_MODE_CONFIG: Record<
  DisplayModeKey,
  {
    label: string;
    border: string;
    bg: string;
    headerBg: string;
    headerBorder: string;
    iconBg: string;
    iconColor: string;
    valueBadge: string;
    chainBadge: string;
  }
> = {
  total_received: {
    label: 'Total Received',
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-950/10',
    headerBg: 'bg-emerald-500/5',
    headerBorder: 'border-emerald-500/10',
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-400',
    valueBadge: 'text-emerald-400',
    chainBadge: 'bg-emerald-500/10 text-emerald-300',
  },
  current_balance: {
    label: 'Current Balance',
    border: 'border-violet-500/20',
    bg: 'bg-violet-950/10',
    headerBg: 'bg-violet-500/5',
    headerBorder: 'border-violet-500/10',
    iconBg: 'bg-violet-500/15',
    iconColor: 'text-violet-400',
    valueBadge: 'text-violet-400',
    chainBadge: 'bg-violet-500/10 text-violet-300',
  },
  total_sent: {
    label: 'Total Sent',
    border: 'border-sky-500/20',
    bg: 'bg-sky-950/10',
    headerBg: 'bg-sky-500/5',
    headerBorder: 'border-sky-500/10',
    iconBg: 'bg-sky-500/15',
    iconColor: 'text-sky-400',
    valueBadge: 'text-sky-400',
    chainBadge: 'bg-sky-500/10 text-sky-300',
  },
};

export type RechartsTooltipPayloadEntry = {
  name?: string;
  value?: number | string;
  payload?: { color?: string };
};

/** Normalize recurring expense/income to monthly USD. */
export function toMonthly(amountUsd: number | string, period: string): number {
  const n = parseFloat(String(amountUsd));
  if (!Number.isFinite(n)) return 0;
  if (period === 'daily') return n * 30;
  if (period === 'monthly') return n;
  if (period === 'annual') return n / 12;
  return 0;
}

/** Normalize recurring expense/income to annual USD (one-time passes through). */
export function toAnnual(amountUsd: number | string, period: string): number {
  const n = parseFloat(String(amountUsd));
  if (!Number.isFinite(n)) return 0;
  if (period === 'daily') return n * 365;
  if (period === 'monthly') return n * 12;
  return n;
}

export function fmt(value: number | string, compact = false): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.00';
  if (compact && n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtMaybe(value: number | string | null | undefined, digits = 2): string | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'DAI', 'BUSD', 'USDC.E']);

/** Investment wallet breakdown: liquid vs LP vs stables. */
export function getInvestmentBreakdown(wallet: TrackedWalletEntry): {
  liquidStableUsd: number;
  lpUsd: number;
  liquidUsd: number;
} {
  const tokens = wallet.tokens ?? [];
  const chains = wallet.chains ?? [];
  const liquidStableUsd = tokens
    .filter((t) => STABLE_SYMBOLS.has((t.symbol ?? '').toUpperCase()))
    .reduce((sum, t) => sum + (t.usdValue ?? 0), 0);
  const lpUsd = chains.reduce((sum, c) => sum + (c.lpUsd ?? 0), 0);
  const liquidUsd = Math.max(0, (wallet.valueUsd ?? 0) - lpUsd);
  return { liquidStableUsd, lpUsd, liquidUsd };
}

export type HardwareProfitLog = {
  id: number;
  earnedAt: string;
  satoshiAmount: string;
  btcUsdPrice: number;
  earnedUsd: number;
  notes?: string | null;
};

export type HardwareProfitSummary = {
  totalEarnedSatoshi: string;
  totalEarnedUsd: number;
  purchaseCostUsd: number;
  recoveredPct: number;
  remainingUsd: number;
  roiReached: boolean;
  avgDailyUsd: number | null;
  estimatedDaysToRoi: number | null;
  firstEarnedAt: string | null;
  lastEarnedAt: string | null;
  logCount: number;
};

export function formatSatoshi(satoshi: string | number | bigint): string {
  const raw = String(satoshi).replace(/\D/g, '') || '0';
  return BigInt(raw).toLocaleString('en-US');
}

export type TransparencyHardwareAsset = {
  id: number;
  name: string;
  manufacturer?: string | null;
  description?: string | null;
  status: string;
  statusLabel?: string | null;
  purchaseCostUsd: number | string;
  transitWeeks?: number | null;
  purchaseNote?: string | null;
  specs: Array<{ label: string; value: string }>;
  model3dUrl?: string | null;
  sortOrder?: number;
  profitSummary?: HardwareProfitSummary;
  profitLogs?: HardwareProfitLog[];
};

export type WithdrawalStatsResponse = {
  ok: boolean;
  currency?: string;
  network?: string;
  totalPol?: number;
  totalCount?: number;
  polUsdPrice?: number | null;
  totalUsd?: number | null;
};
