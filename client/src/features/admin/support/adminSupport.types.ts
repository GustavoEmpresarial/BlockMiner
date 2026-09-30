/**
 * Typed contracts and DTOs for Admin Support (/admin/support).
 */

export type AdminSupportPlayerDossierParams = {
  limit: number;
  depositsPage: number;
  ccpaymentPage: number;
  withdrawalsPage: number;
  payoutsPage: number;
  minersPage: number;
  inventoryPage: number;
  vaultPage: number;
};

export type AdminSupportPlayerDossierTicketPublic = {
  id: number;
  name?: string | null;
  email?: string | null;
};

/** User summary embedded in support player dossier. */
export type AdminSupportDossierSummary = {
  id: number;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  walletAddress?: string | null;
  registrationIp?: string | null;
  lastIp?: string | null;
  isBanned?: boolean;
  createdAt?: string | Date | null;
  lastLoginAt?: string | Date | null;
  polBalance?: number | string | null;
  blkBalance?: number | string | null;
};

export type AdminSupportDossierIpOverlapUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  createdAt?: string | Date | null;
  registrationIp?: string | null;
  ip?: string | null;
  ipOverlapReasons?: string[];
};

export type AdminSupportDossierProfileWalletDupeUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  createdAt?: string | Date | null;
};

export type AdminSupportDossierChainOverlapOtherUser = {
  id: number;
  username?: string | null;
  email?: string | null;
  createdAt?: string | Date | null;
  via: string[];
};

export type AdminSupportDossierChainOverlapBlock = {
  address: string;
  otherUsers: AdminSupportDossierChainOverlapOtherUser[];
};

export type AdminSupportDossierAccountCollisions = {
  hasRisk: boolean;
  registrationIp?: string | null;
  lastIp?: string | null;
  ipOverlapUsers?: AdminSupportDossierIpOverlapUser[];
  profileWalletDuplicateUsers?: AdminSupportDossierProfileWalletDupeUser[];
  chainAddressOverlaps?: AdminSupportDossierChainOverlapBlock[];
};

export type AdminSupportDossierPaged<T> = {
  rows: T[];
  total: number;
  page?: number;
  limit?: number;
};

export type AdminSupportDossierDepositRow = {
  id: number | string;
  amount?: number | string | null;
  status?: string | null;
  createdAt?: string | Date | null;
};

export type AdminSupportDossierCcpaymentRow = {
  id: number | string;
  amountPol?: number | string | null;
  credited?: boolean;
  createdAt?: string | Date | null;
};

export type AdminSupportDossierWithdrawalRow = {
  id: number | string;
  amount?: number | string | null;
  status?: string | null;
  address?: string | null;
  createdAt?: string | Date | null;
};

export type AdminSupportDossierPayoutRow = {
  id: number | string;
  amountPol?: number | string | null;
  source?: string | null;
  createdAt?: string | Date | null;
};

export type AdminSupportDossierMinerRow = {
  id: number | string;
  slotIndex?: number;
  level?: number | string;
  hashRate?: number | string;
  slotSize?: number | string;
  isActive?: boolean;
  displayName?: string;
  imageUrl?: string | null;
  minerId?: number | null;
};

export type AdminSupportDossierMachineCardRow = {
  id: number | string;
  slotIndex?: number;
  level?: number | string;
  hashRate?: number | string;
  slotSize?: number | string;
  isActive?: boolean;
  displayName?: string;
  imageUrl?: string | null;
  acquiredAt?: string | Date | null;
  expiresAt?: string | Date | null;
  storedAt?: string | Date | null;
};

export type AdminSupportPlayerDossierData = {
  summary: AdminSupportDossierSummary;
  walletAddresses: string[];
  accountCollisions?: AdminSupportDossierAccountCollisions | null;
  depositTransactions: AdminSupportDossierPaged<AdminSupportDossierDepositRow>;
  ccpaymentDeposits: AdminSupportDossierPaged<AdminSupportDossierCcpaymentRow>;
  withdrawalTransactions: AdminSupportDossierPaged<AdminSupportDossierWithdrawalRow>;
  payouts: AdminSupportDossierPaged<AdminSupportDossierPayoutRow>;
  miners: AdminSupportDossierPaged<AdminSupportDossierMinerRow>;
  inventory?: AdminSupportDossierPaged<AdminSupportDossierMachineCardRow>;
  vault?: AdminSupportDossierPaged<AdminSupportDossierMachineCardRow>;
};

export type AdminSupportPlayerDossierBundle = {
  ok: true;
  linked: boolean;
  orphanTicket?: boolean;
  userId?: number;
  ticket?: AdminSupportPlayerDossierTicketPublic;
  dossier: AdminSupportPlayerDossierData | null;
};

export function isAdminSupportPlayerDossierBundle(value: unknown): value is AdminSupportPlayerDossierBundle {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return o.ok === true && typeof o.linked === 'boolean';
}

export type AdminSupportAttachment = {
  url: string;
  mimeType?: string;
};

export type AdminSupportUserSnippet = {
  username?: string | null;
  email?: string | null;
};

export type AdminSupportInboxMessage = {
  id: number;
  userId?: number | null;
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  message?: string | null;
  isRead?: boolean;
  isReplied?: boolean;
  createdAt: string | Date;
  user?: AdminSupportUserSnippet | null;
};

export type AdminSupportListApiResponse = {
  ok: boolean;
  messages?: AdminSupportInboxMessage[];
  page?: number;
  limit?: number;
  total?: number;
};

export type AdminSupportReplyEntry = {
  id: number;
  supportMessageId?: number;
  senderId?: number | null;
  isAdmin: boolean;
  createdAt: string | Date;
  body?: string | null;
  message?: string | null;
  attachments?: AdminSupportAttachment[];
};

export type AdminSupportMessageDetail = AdminSupportInboxMessage & {
  body?: string | null;
  attachments?: AdminSupportAttachment[];
  reply?: string | null;
  replies?: AdminSupportReplyEntry[];
};

export type AdminSupportMessageApiResponse = {
  ok: boolean;
  message?: AdminSupportMessageDetail;
};

export type AdminSupportListFilter = "all" | "unread" | "pending" | "replied";

export type AdminSupportCreditPolInput = {
  amount: number;
  reason: string;
};

export type AdminSupportCreditPolResponse = {
  ok: boolean;
  message?: string;
  amount?: number;
  polBalance?: number | null;
  transactionId?: number;
};

export type AdminSupportReplyInput = {
  reply: string;
  attachments?: AdminSupportAttachment[];
};

export type AdminSupportReplyPostResponse = {
  ok: boolean;
  message?: string;
};

export type AdminSupportArchiveResponse = {
  ok: boolean;
  archived: boolean;
};

export type AdminSupportSubscribeAck = {
  ok?: boolean;
  message?: string;
};

export type AdminSupportSocketReplyPayload = {
  supportMessageId?: number | string;
  reply?: AdminSupportReplyEntry;
};

export type AdminSupportUploadImageResponse = {
  ok?: boolean;
  url?: string;
  mimeType?: string;
};
