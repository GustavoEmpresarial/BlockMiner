/**
 * Client-side domain types for Admin Finance & Withdrawal Queue management.
 */

export interface AdminWithdrawalUser {
  id?: number;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  walletAddress?: string | null;
}

export type WithdrawalStatus =
  | 'pending'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'rejected';

export interface AdminWithdrawalRow {
  id: number;
  userId: number;
  amount: number;
  address: string | null;
  status: WithdrawalStatus | string;
  /** 'withdrawal' (POL nativo) ou 'shib_withdrawal' (SHIB ERC20) */
  type: 'withdrawal' | 'shib_withdrawal' | string;
  txHash: string | null;
  createdAt: string;
  updatedAt?: string | null;
  completedAt?: string | null;
  user?: AdminWithdrawalUser | null;
}

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

export interface CompleteWithdrawalInput {
  txHash: string;
}

export interface AdminFinanceApiResponse<T = unknown> {
  ok: boolean;
  message?: string;
  error?: string;
  data?: T;
}
