/**
 * Ported from legacy/server/modules/pricing/internal-price-oracle.ts.
 * Internal oracle: resolves USD price at event time (historical CoinGecko lookup, see
 * shared/cryptoPrice/cryptoPrice.ts#getPolUsdPriceAt) and persists an immutable snapshot.
 */
import { getPolUsdPriceAt } from "../../shared/cryptoPrice/cryptoPrice.js";
import { findOrCreatePriceSnapshot } from "./price-snapshot.repository.js";
import type { AssetCode, PriceSnapshot } from "./pricing.types.js";

const COINGECKO_SOURCE = "coingecko";

async function fetchHistoricalUsdPrice(asset: AssetCode, eventAt: Date): Promise<number> {
  if (asset !== "POL") throw new Error(`Unsupported asset for historical pricing: ${asset}`);
  return getPolUsdPriceAt(Math.floor(eventAt.getTime() / 1000));
}

export async function resolveAndPersistPrice(asset: AssetCode, eventAt: Date): Promise<PriceSnapshot> {
  const priceUsd = await fetchHistoricalUsdPrice(asset, eventAt);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    throw new Error(`Invalid ${asset} USD price for ${eventAt.toISOString()}`);
  }
  return findOrCreatePriceSnapshot({
    asset,
    eventAt,
    priceUsd,
    source: COINGECKO_SOURCE,
    sourceRef: `history:${Math.floor(eventAt.getTime() / 1000)}`,
  });
}

export function computeUsdValue(polAmount: number, usdRate: number): number {
  const value = polAmount * usdRate;
  return Math.round(value * 1e8) / 1e8;
}
