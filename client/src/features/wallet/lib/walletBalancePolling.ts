import type { AxiosError } from 'axios';

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

const viteEnv =
  typeof import.meta !== 'undefined' && import.meta.env
    ? (import.meta.env as Record<string, string | undefined>)
    : {};

/** Default interval between successful wallet balance polls. */
export const WALLET_BALANCE_POLL_MS = readPositiveInt(
  viteEnv.VITE_WALLET_BALANCE_POLL_MS,
  30_000,
);

const WALLET_BALANCE_BACKOFF_MAX_MS = readPositiveInt(
  viteEnv.VITE_WALLET_BALANCE_BACKOFF_MAX_MS,
  300_000,
);

export type WalletHttpErrorKind = 'auth' | 'unavailable' | 'other';

export function classifyWalletHttpError(err: unknown): WalletHttpErrorKind {
  const ax = err as AxiosError | undefined;
  const status = ax?.response?.status;
  if (status === 401 || status === 403) return 'auth';
  if (status === 502 || status === 503 || status === 504 || status === 429) return 'unavailable';
  if (ax?.code === 'ERR_NETWORK' || ax?.message === 'Network Error') return 'unavailable';
  return 'other';
}

export function nextWalletBalanceBackoffMs(currentMs: number): number {
  const base = Math.max(WALLET_BALANCE_POLL_MS, currentMs);
  return Math.min(base * 2, WALLET_BALANCE_BACKOFF_MAX_MS);
}
