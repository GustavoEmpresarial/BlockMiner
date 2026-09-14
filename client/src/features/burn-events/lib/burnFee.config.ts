export const BURN_FEE_RATES = {
  SHIB: 20,
  POL: 0.01,
  BLK: 0.001,
} as const;

export type BurnFeeCurrency = keyof typeof BURN_FEE_RATES;

export const ALLOWED_BURN_FEE_CURRENCIES: readonly BurnFeeCurrency[] = ['SHIB', 'POL', 'BLK'] as const;

export function getBurnFeeAmount(currency: BurnFeeCurrency): number {
  return BURN_FEE_RATES[currency];
}

export function hasSufficientFeeBalance(
  currency: BurnFeeCurrency,
  balances: { shib: number; pol: number; blk: number }
): boolean {
  const required = getBurnFeeAmount(currency);
  const current =
    currency === 'SHIB'
      ? balances.shib
      : currency === 'POL'
      ? balances.pol
      : balances.blk;
  return Number.isFinite(current) && current >= required;
}
