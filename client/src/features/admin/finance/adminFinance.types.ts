/** Client-side shapes for `AdminFinance.tsx` (server is authoritative). */

export type CollisionHints = {
  hasRisk?: boolean;
  ipOverlapUsers?: unknown[];
  otherUsersForDestination?: unknown[];
  otherUsersForProfileWallet?: unknown[];
};

export type AdminFinancePendingWithdrawal = {
  id: number;
  created_at?: string | null;
  createdAt?: string | null;
  address: string;
  amount: number | string;
  status: string;
  /** `"withdrawal"` (POL nativo) ou `"shib_withdrawal"` (SHIB ERC20) */
  type?: string;
  /** Raw `0x…` on the hot-wallet path; `coinex:NNN` marker while a CoinEx send is in flight. */
  txHash?: string | null;
  userId?: number | null;
  user?: {
    username?: string | null;
    email?: string | null;
    registrationIp?: string | null;
    ip?: string | null;
    walletAddress?: string | null;
  } | null;
  collisionHints?: CollisionHints | null;
};

export interface AdminHotWalletStatus {
  configured: boolean;
  autoSendEnabled: boolean;
  globalPause: boolean;
  viaCoinEx: boolean;
  address: string | null;
  balancePol: number | null;
  minReservePol: number;
  cooldownMs: number;
  pendingApprovedCount: number;
  pendingApprovedPol: number;
  canCoverPending: boolean | null;
}

/** Backward compatibility alias for AdminHotWalletStatus. */
export type AdminAutoSendStatus = AdminHotWalletStatus;

export type AdminFinanceOverview = {
  deposits24h?: number | string | null;
  withdrawals24h?: number | string | null;
};

export type FinancePeriod = {
  deposits: { pol: number; usd: number; count: number };
  withdrawals: { pol: number; usd: number; count: number };
  net: { pol: number; usd: number };
};

export type FinanceDailyRow = {
  date: string;
  deposited: number;
  withdrawn: number;
  net: number;
};

export type FinanceTopUser = {
  userId: number;
  username: string | null;
  email: string | null;
  deposited: number;
  withdrawn: number;
  net: number;
  txCount: number;
  lastAt: string | null;
};

export type AdminFinanceSummary = {
  polUsdPrice: number;
  allTime: FinancePeriod;
  h24: FinancePeriod;
  d7: FinancePeriod;
  d30: FinancePeriod;
  pendingWithdrawals: { count: number; pol: number; usd: number };
  daily: FinanceDailyRow[];
  topUsers: FinanceTopUser[];
};

/** Form strings mirror controlled `<input>` values; server numbers are normalized on load. */
export type BlkEconomyFormState = {
  polPerBlk: string;
  convertFeeBps: string;
  minConvertPol: string;
  dailyConvertLimitBlk: string;
  convertCooldownSec: string;
  blkCycleReward: string;
  blkCycleIntervalSec: string;
  blkCycleActivitySec: string;
  blkCycleMinHashrate: string;
  blkCyclePaused: boolean;
  blkCycleBoost: string;
};

export type AdminFinanceActivityRow = {
  id?: number | string;
  type?: string;
  status?: string;
  amount?: number | string;
  txHash?: string | null;
  tx_hash?: string | null;
  fromAddress?: string | null;
  from_address?: string | null;
  toAddress?: string | null;
  address?: string | null;
  user_id?: number | null;
  userId?: number | null;
  user?: {
    username?: string | null;
    email?: string | null;
    walletAddress?: string | null;
  } | null;
  createdAt?: string | null;
  created_at?: string | null;
};

export type UserDetailModalState = { userId: number };

export type CompleteWithdrawalModalState = {
  id: number;
  address: string;
  amount: number | string;
  username?: string | null;
  userId?: number | null;
  status?: string;
};

export type TelegramSettingsState = {
  enabled?: boolean;
  botTokenConfigured?: boolean;
  privateChatConfigured?: boolean;
  publicChatConfigured?: boolean;
  publicThreadConfigured?: boolean;
  screenshotEnabled?: boolean;
  legacyDbTokenPresent?: boolean;
  privateAlertsEnabled?: boolean;
  privateChatId?: string | null;
  publicProofsEnabled?: boolean;
  publicChatId?: string | null;
  publicThreadId?: string | null;
  polygonscanBaseUrl?: string;
};

export type TelegramHealthState = {
  configured?: boolean;
  queue?: Record<string, string | number | boolean | null | undefined> & { lastSent?: unknown };
};

export type TelegramEventRow = {
  id: number | string;
  type?: string;
  status?: string;
  attempts?: number;
  lastError?: string | null;
  createdAt?: string | null;
};

export type UserFinanceDetailData = {
  user: {
    id?: number;
    name?: string | null;
    username?: string | null;
    email?: string | null;
    walletAddress?: string | null;
    polBalance?: number | string | null;
    isBanned?: boolean;
    ip?: string | null;
    registrationIp?: string | null;
    createdAt?: string | null;
    lastLoginAt?: string | null;
  };
  metrics?: {
    activeMachines?: number | null;
    realHashRate?: number | string | null;
    faucetClaims?: number | null;
  } | null;
  recentTransactions?: Array<{
    id: number | string;
    type?: string;
    amount?: number | string;
    status?: string;
    createdAt?: string | null;
  }>;
};

export type ActivityFiltersSnapshot = {
  page: number;
  limit: number;
  type: string;
  hash: string;
  q: string;
  status: string;
};
