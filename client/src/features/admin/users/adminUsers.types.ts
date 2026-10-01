import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

export type LucideIc = ComponentType<LucideProps>;

export type IpIntel = {
  asn?: string | number | null;
  providerType?: string | null;
  proxyDetected?: boolean;
  proxyType?: string | null;
  proxyRiskScore?: number | null;
  proxyCheckedAt?: string | null;
  reverseDns?: string | null;
};

export type AdminUsersListRow = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  status?: string;
  createdAt?: string | Date | null;
  isBanned?: boolean;
  registrationIp?: string | null;
  lastIp?: string | null;
  lastIpIntelligence?: IpIntel | null;
  walletAddress?: string | null;
  polBalance?: number | string | null;
  hashRate?: number | string | null;
  activeMachines?: number | null;
  indicators?: {
    hasWallet?: boolean;
    hasDeposit?: boolean;
    hasWithdrawal?: boolean;
    hasSharedIp?: boolean;
    possibleMultiAccount?: boolean;
    isQaTestAccount?: boolean;
  } | null;
  totalTransactions?: number | null;
  totalLogs?: number | null;
};

export type PolygonHd = { address?: string | null };

export type AdminDossierUser = {
  id: number;
  username?: string | null;
  name?: string | null;
  email?: string | null;
  isBanned?: boolean;
  polBalance?: number | string | null;
  blkBalance?: number | string | null;
  blkLocked?: number | string | null;
  shibBalance?: number | string | null;
  btcBalance?: number | string | null;
  ethBalance?: number | string | null;
  usdtBalance?: number | string | null;
  usdcBalance?: number | string | null;
  zerBalance?: number | string | null;
  oldBaseHashRate?: number | string | null;
  walletAddress?: string | null;
  polygonHdAddress?: PolygonHd | null;
  registrationIp?: string | null;
  ip?: string | null;
  lastLoginAt?: string | Date | null;
  createdAt?: string | Date | null;
  refCode?: string | null;
  lastIpIntelligence?: IpIntel | null;
};

export type AdminDossierMetrics = {
  realHashRate?: number | string | null;
  activeMachines?: number | null;
  referrer?: { id: number; username?: string | null; email?: string | null } | null;
  referredCount?: number | null;
  faucetClaims?: number | null;
  totalDeposited?: number | string | null;
  totalWithdrawn?: number | string | null;
  totalTransactions?: number | null;
  totalLogs?: number | null;
  riskSummary?: string | null;
};

export type AdminUserDetailsPayload = {
  ok: boolean;
  user: AdminDossierUser;
  metrics: AdminDossierMetrics;
  message?: string;
};

export type UsersListApiResponse = { ok: boolean; users?: AdminUsersListRow[]; total?: number | string };

export type MinerCatalogRow = { id: number | string; name?: string | null; baseHashRate?: number | string | null };

export type MinersCatalogResponse = { ok: boolean; miners?: MinerCatalogRow[] };

export type TransactionRow = {
  id: number | string;
  type?: string;
  amount?: number | string;
  status?: string;
  txHash?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  createdAt?: string;
  metadata?: unknown;
};

export type LogRow = {
  id: number | string;
  label?: string;
  action?: string;
  description?: string;
  source?: string;
  severity?: string;
  createdAt?: string;
  ip?: string | null;
  relatedEntityId?: string | number | null;
  relatedEntityType?: string | null;
  metadata?: unknown;
};

export type TicketRow = { id: number | string; subject?: string; message?: string; isReplied?: boolean; createdAt?: string };

export type MachineRow = {
  id: number | string;
  imageUrl?: string | null;
  miner?: { name?: string | null } | null;
  hashRate?: number | string | null;
  slotIndex?: number | string;
  isActive?: boolean;
};

export type RelatedUserRow = {
  id: number;
  username?: string | null;
  email?: string | null;
  ip?: string | null;
  registrationIp?: string | null;
};

export type RelatedUserWithRel = RelatedUserRow & { rel: string };

export type ReferralRow = { id: number; referrerId: number; referredId: number; createdAt: string };

export type RelatedDataPayload = {
  sameIp?: RelatedUserRow[];
  sameWallet?: RelatedUserRow[];
  referrals?: ReferralRow[];
};

export type TabData = {
  transactions?: TransactionRow[];
  total?: number;
  logs?: LogRow[];
  tickets?: TicketRow[];
  machines?: MachineRow[];
} & RelatedDataPayload;

export type AdminUsersTabSlice = {
  page?: number;
  q?: string;
  type?: string;
  status?: string;
  source?: string;
  severity?: string;
  loading?: boolean;
  error?: boolean;
  data?: TabData;
};

export type TabStateMap = Partial<Record<string, AdminUsersTabSlice>>;

export type AdminBalanceCurrency =
  | 'pol'
  | 'blk'
  | 'blkLocked'
  | 'shib'
  | 'btc'
  | 'eth'
  | 'usdt'
  | 'usdc'
  | 'zer';

export type AdminUserDetail = AdminDossierUser;
export type AdminUserMetrics = AdminDossierMetrics;

export type AdminAdjustBalanceInput = {
  currency: AdminBalanceCurrency;
  mode: 'set' | 'add';
  amount: number;
  reason?: string;
};

export type AdminBanUserInput = {
  reason?: string;
  days?: number;
};

export type AdminResetPasswordInput = {
  newPassword?: string;
};

export type AdminSendMinerInput = {
  minerId: number;
  quantity?: number;
};

export type AdminUsersStats = {
  total: number;
  active: number;
  banned: number;
};

export type AdminUsersListApiResponse = {
  ok: boolean;
  users?: AdminUsersListRow[];
  total?: number;
  page?: number;
  pageSize?: number;
  stats?: AdminUsersStats;
};

export type AdminUserTicketsResponse = {
  ok: boolean;
  userId: number;
  tickets: Array<{
    id: number;
    subject: string;
    isRead: boolean;
    isReplied: boolean;
    repliedAt: string | null;
    createdAt: string;
    _count?: { replies: number };
  }>;
};

export type AdminUserRelatedResponse = {
  ok: boolean;
  userId: number;
  related: Array<{
    id: number;
    username: string | null;
    name: string | null;
    email: string;
    isBanned: boolean;
    createdAt: string;
    reasons: string[];
  }>;
};

export type AdminUserWalletLedgerResponse = {
  ok: boolean;
  userId: number;
  balances: Record<string, number | null>;
  walletAddress: string | null;
};

export type AdminUserActivitySummaryResponse = {
  ok: boolean;
  userId: number;
  session: {
    ytSecondsBalance: number;
    autoMiningSecondsBalance: number;
    lastHeartbeatAt: string | null;
  };
};

