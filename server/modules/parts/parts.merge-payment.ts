/**
 * Merge fee payment options. The fee is a flat share of the machine's base price
 * (Miner.price, in BLK; 1 BLK ≈ US$ 1), the same for every rarity level:
 *   - paid in BLK:          15% of the base price
 *   - paid in POL or SHIB:  10% of the base price (5 points cheaper), converted
 *                           at the live USD price of the coin.
 */
export const MERGE_PAYMENT_ASSETS = ["BLK", "POL", "SHIB"] as const;
export type MergePaymentAsset = (typeof MERGE_PAYMENT_ASSETS)[number];

export const MERGE_FEE_PERCENT_BLK = 15;
export const MERGE_FEE_PERCENT_CRYPTO = 10;
export const MERGE_CRYPTO_DISCOUNT_POINTS = MERGE_FEE_PERCENT_BLK - MERGE_FEE_PERCENT_CRYPTO;

export const MERGE_PAYMENT_BALANCE_FIELD = {
  BLK: "blkBalance",
  POL: "polBalance",
  SHIB: "shibBalance",
} as const satisfies Record<MergePaymentAsset, string>;

export type MergeFeeQuote = {
  asset: MergePaymentAsset;
  feePercent: number;
  /** Fee value in BLK / USD terms. */
  feeUsd: number;
  /** Amount of `asset` that will be debited. */
  amount: number;
  /** USD price of one unit of `asset` used for the conversion. */
  usdPrice: number;
};

export type MergeUsdPrices = { POL: number; SHIB: number };

export function parseMergePaymentAsset(raw: unknown): MergePaymentAsset {
  const value = String(raw ?? "").trim().toUpperCase();
  return (MERGE_PAYMENT_ASSETS as readonly string[]).includes(value) ? (value as MergePaymentAsset) : "BLK";
}

export function mergeFeePercentFor(asset: MergePaymentAsset): number {
  return asset === "BLK" ? MERGE_FEE_PERCENT_BLK : MERGE_FEE_PERCENT_CRYPTO;
}

function roundUp8(value: number): number {
  return Math.ceil(value * 100_000_000 - 1e-6) / 100_000_000;
}

export function quoteMergeFee(basePrice: number, asset: MergePaymentAsset, prices: MergeUsdPrices): MergeFeeQuote | null {
  const safePrice = Number.isFinite(basePrice) && basePrice > 0 ? basePrice : 0;
  const feePercent = mergeFeePercentFor(asset);
  const feeUsd = roundUp8((safePrice * feePercent) / 100);
  if (asset === "BLK") {
    return { asset, feePercent, feeUsd, amount: feeUsd, usdPrice: 1 };
  }
  const usdPrice = Number(prices[asset]);
  if (!Number.isFinite(usdPrice) || usdPrice <= 0) return null;
  return { asset, feePercent, feeUsd, amount: roundUp8(feeUsd / usdPrice), usdPrice };
}

export function quoteAllMergeFees(basePrice: number, prices: MergeUsdPrices): MergeFeeQuote[] {
  return MERGE_PAYMENT_ASSETS.map((asset) => quoteMergeFee(basePrice, asset, prices)).filter(
    (q): q is MergeFeeQuote => q != null,
  );
}
