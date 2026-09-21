export type TransparencyType = 'expense' | 'income';
export type TransparencyPeriod = 'monthly' | 'annual' | 'one_time' | 'daily';

export type TransparencyEntryRow = {
  id: number;
  type: TransparencyType;
  category: string;
  incomeCategory?: string | null;
  name: string;
  description?: string | null;
  provider?: string | null;
  providerUrl?: string | null;
  imageUrl?: string | null;
  amountUsd: number | string;
  amountOriginal?: number | string | null;
  currencyCode: string;
  fxRateUsd?: number | string | null;
  period: TransparencyPeriod | string;
  entryDate?: string | null;
  direction?: 'in' | 'out' | null;
  blockchain?: string | null;
  walletAddress?: string | null;
  txHash?: string | null;
  referenceUrl?: string | null;
  isOnChain: boolean;
  isPaid: boolean;
  isActive: boolean;
  notes?: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type TrackedWalletRow = {
  id: number;
  label: string;
  address: string;
  chain: string;
  assetSymbol: string;
  explorerBaseUrl?: string | null;
  isActive: boolean;
  isPublic: boolean;
  includeInTotals: boolean;
  displayMode: string;
  sortOrder: number;
  manualUsdValue?: number | null;
  manualValueNote?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type HardwareAssetRow = {
  id: number;
  name: string;
  manufacturer?: string | null;
  description?: string | null;
  status: 'running' | 'maintenance' | 'retired' | string;
  statusLabel?: string | null;
  purchaseCostUsd: number;
  transitWeeks?: number | null;
  purchaseNote?: string | null;
  specs?: Array<{ label: string; value: string }> | unknown;
  model3dUrl?: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type HardwareProfitLogRow = {
  id: number;
  earnedAt: string;
  satoshiAmount: string;
  btcUsdPrice: number;
  earnedUsd: number;
  notes?: string | null;
};

export type HardwareRoiSummary = {
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

export type ExternalInvestmentRow = {
  id: number;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  amountInvestedUsd: number | string;
  amountWithdrawnUsd: number | string;
  roiForecast?: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};
