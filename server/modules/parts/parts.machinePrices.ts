/**
 * Read-only part cost of a shop machine, chosen by base hashrate.
 * Assembly and purchase are not wired.
 */
import type { PartSlug } from "./parts.catalog.js";

export const PART_PRICE_BAND = {
  starter: "starter",
  mid: "mid",
  high: "high",
  elite: "elite",
} as const;

export type PartPriceBand = (typeof PART_PRICE_BAND)[keyof typeof PART_PRICE_BAND];

/** Inclusive upper bound of the starter band (H/s). */
export const PART_PRICE_HASHRATE_STARTER_MAX = 30;
/** Inclusive upper bound of the mid band (H/s). */
export const PART_PRICE_HASHRATE_MID_MAX = 100;
/** Inclusive upper bound of the high band (H/s). Above this is elite. */
export const PART_PRICE_HASHRATE_HIGH_MAX = 1000;

export type PartCost = { slug: PartSlug; required: number };

export const PART_PRICE_RECIPES: Record<PartPriceBand, readonly PartCost[]> = {
  starter: [
    { slug: "power_cable", required: 2 },
    { slug: "asic_chip", required: 1 },
    { slug: "cooling_fan", required: 1 },
    { slug: "thermal_pad", required: 1 },
  ],
  mid: [
    { slug: "power_cable", required: 2 },
    { slug: "asic_chip", required: 2 },
    { slug: "cooling_fan", required: 1 },
    { slug: "hashboard", required: 1 },
    { slug: "power_supply", required: 1 },
  ],
  high: [
    { slug: "power_cable", required: 3 },
    { slug: "asic_chip", required: 4 },
    { slug: "cooling_fan", required: 2 },
    { slug: "hashboard", required: 2 },
    { slug: "power_supply", required: 1 },
    { slug: "thermal_pad", required: 1 },
  ],
  elite: [
    { slug: "power_cable", required: 4 },
    { slug: "asic_chip", required: 8 },
    { slug: "cooling_fan", required: 2 },
    { slug: "hashboard", required: 3 },
    { slug: "power_supply", required: 2 },
    { slug: "thermal_pad", required: 2 },
  ],
};

export function priceBandForHashRate(hashRate: number): PartPriceBand {
  const n = Number(hashRate);
  const value = Number.isFinite(n) ? n : 0;
  if (value <= PART_PRICE_HASHRATE_STARTER_MAX) return PART_PRICE_BAND.starter;
  if (value <= PART_PRICE_HASHRATE_MID_MAX) return PART_PRICE_BAND.mid;
  if (value <= PART_PRICE_HASHRATE_HIGH_MAX) return PART_PRICE_BAND.high;
  return PART_PRICE_BAND.elite;
}

export function partCostsForHashRate(hashRate: number): readonly PartCost[] {
  return PART_PRICE_RECIPES[priceBandForHashRate(hashRate)];
}
