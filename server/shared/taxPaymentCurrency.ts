/**
 * Shared currency choice for user-paid taxes/fees (energy tax, streak recovery, power boost).
 * Fees are priced in POL; BLK/SHIB debits use live USD conversion.
 * Convention: 1 BLK ≈ 1 USD (same as wallet `blkUsdEquivalent`).
 */
import { getPolUsdPrice, getShibUsdPrice } from "./cryptoPrice/cryptoPrice.js";

export const TAX_PAY_CURRENCIES = ["POL", "BLK", "SHIB"] as const;
export type TaxPayCurrency = (typeof TAX_PAY_CURRENCIES)[number];

export const TAX_PAY_BALANCE_FIELD = {
  POL: "polBalance",
  BLK: "blkBalance",
  SHIB: "shibBalance",
} as const satisfies Record<TaxPayCurrency, "polBalance" | "blkBalance" | "shibBalance">;

export type TaxPayBalances = Record<TaxPayCurrency, number>;

export type TaxPayQuote = {
  amount: number;
  balance: number;
  affordable: boolean;
};

export type TaxPayQuotes = Record<TaxPayCurrency, TaxPayQuote>;

export function isTaxPayCurrency(value: unknown): value is TaxPayCurrency {
  return typeof value === "string" && (TAX_PAY_CURRENCIES as readonly string[]).includes(value.toUpperCase());
}

/** Normalize request body / query currency; default POL. */
export function parseTaxPayCurrency(value: unknown): TaxPayCurrency {
  if (typeof value !== "string") return "POL";
  const upper = value.trim().toUpperCase();
  return isTaxPayCurrency(upper) ? upper : "POL";
}

export function taxPayBalanceField(currency: TaxPayCurrency): (typeof TAX_PAY_BALANCE_FIELD)[TaxPayCurrency] {
  return TAX_PAY_BALANCE_FIELD[currency];
}

export function readTaxPayBalance(
  user: { polBalance?: unknown; blkBalance?: unknown; shibBalance?: unknown } | null | undefined,
  currency: TaxPayCurrency,
): number {
  if (!user) return 0;
  const field = taxPayBalanceField(currency);
  const n = Number(user[field] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function balancesFromUser(user: {
  polBalance?: unknown;
  blkBalance?: unknown;
  shibBalance?: unknown;
} | null | undefined): TaxPayBalances {
  return {
    POL: readTaxPayBalance(user, "POL"),
    BLK: readTaxPayBalance(user, "BLK"),
    SHIB: readTaxPayBalance(user, "SHIB"),
  };
}

/**
 * Convert a POL-denominated fee into the debit amount for `currency`.
 * SHIB is rounded up so the platform receives at least the USD equivalent.
 */
export async function convertPolFeeToCurrency(amountPol: number, currency: TaxPayCurrency): Promise<number> {
  if (!Number.isFinite(amountPol) || amountPol <= 0) return 0;
  if (currency === "POL") return Number(amountPol.toFixed(8));

  const polUsd = await getPolUsdPrice();
  const usd = amountPol * (polUsd > 0 ? polUsd : 0.09);

  if (currency === "BLK") {
    return Number(usd.toFixed(8));
  }

  const shibUsd = await getShibUsdPrice();
  const shibPrice = shibUsd > 0 ? shibUsd : 0.0000055;
  return Math.max(1, Math.ceil(usd / shibPrice));
}

export async function buildTaxPayQuotes(
  amountPol: number,
  balances: TaxPayBalances,
): Promise<TaxPayQuotes> {
  const quotes = {} as TaxPayQuotes;
  for (const currency of TAX_PAY_CURRENCIES) {
    const amount = await convertPolFeeToCurrency(amountPol, currency);
    const balance = balances[currency];
    quotes[currency] = {
      amount,
      balance,
      affordable: balance + 1e-12 >= amount,
    };
  }
  return quotes;
}
