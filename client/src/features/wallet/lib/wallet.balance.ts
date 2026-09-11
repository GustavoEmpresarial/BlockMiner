import type { WalletBalanceResponse } from './wallet.types';

export type WalletBalanceOverview = {
  amount: number;
  blkBalance: number;
  blkLocked: number;
  shibBalance: number;
  lifetimeMined: number;
  totalWithdrawn: number;
};

/** Map GET /wallet/balance JSON → overview card numbers (legacy `balance` = POL). */
export function parseWalletBalanceOverview(
  data: Pick<
    WalletBalanceResponse,
    'balance' | 'polBalance' | 'blkBalance' | 'blkLocked' | 'shibBalance' | 'lifetimeMined' | 'totalWithdrawn'
  >,
): WalletBalanceOverview {
  const polRaw = data.balance ?? data.polBalance ?? 0;
  return {
    amount: Number(polRaw) || 0,
    blkBalance: Number(data.blkBalance ?? 0),
    blkLocked: Number(data.blkLocked ?? 0),
    shibBalance: Number(data.shibBalance ?? 0),
    lifetimeMined: Number(data.lifetimeMined || 0),
    totalWithdrawn: Number(data.totalWithdrawn || 0),
  };
}
