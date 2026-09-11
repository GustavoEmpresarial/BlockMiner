export type TaxPayCurrency = 'POL' | 'BLK' | 'SHIB';

export type TaxPayQuote = {
  amount: number;
  balance: number;
  affordable: boolean;
};

export type TaxPayQuotes = Partial<Record<TaxPayCurrency, TaxPayQuote>>;

export function pickDefaultTaxPayCurrency(quotes: TaxPayQuotes): TaxPayCurrency {
  const order: TaxPayCurrency[] = ['POL', 'BLK', 'SHIB'];
  for (const currency of order) {
    if (quotes[currency]?.affordable) return currency;
  }
  return 'POL';
}

export function formatTaxPayAmount(amount: number, currency: TaxPayCurrency): string {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  if (currency === 'SHIB') return `${value.toLocaleString()} SHIB`;
  return `${value.toFixed(currency === 'POL' ? 4 : 2)} ${currency}`;
}
