/**
 * Deterministic offerwall part drops based on credit value and sourceRef hash.
 * The same source + sourceRef always yields the exact same roll and catalog slug,
 * so retried webhooks cannot reroll or exploit the RNG.
 */
import { createHash } from "node:crypto";
import { PART_SLUGS, type PartSlug } from "./parts.catalog.js";

export const PARTS_PER_OFFERWALL_CREDIT_ENV_KEY = "PARTS_PER_OFFERWALL_CREDIT";
export const DEFAULT_PARTS_PER_OFFERWALL_CREDIT = 1;

export const PART_GRANT_SOURCE = {
  offerwallme: "offerwallme",
  offerwallgg: "offerwallgg",
  multiwall: "multiwall",
  zerads: "zerads",
  moneyrain: "moneyrain",
  internal: "internal",
  faucet: "faucet",
  shortlink: "shortlink",
  automining: "automining",
  youtube: "youtube",
  ptc: "ptc",
} as const;

export type PartGrantSource = (typeof PART_GRANT_SOURCE)[keyof typeof PART_GRANT_SOURCE];

/** Engagement loops that share one drop chance, distinct from offerwall USD tiers. */
export const ACTIVITY_PART_GRANT_SOURCE = {
  faucet: PART_GRANT_SOURCE.faucet,
  shortlink: PART_GRANT_SOURCE.shortlink,
  automining: PART_GRANT_SOURCE.automining,
  youtube: PART_GRANT_SOURCE.youtube,
  ptc: PART_GRANT_SOURCE.ptc,
} as const;

export type ActivityPartGrantSource = (typeof ACTIVITY_PART_GRANT_SOURCE)[keyof typeof ACTIVITY_PART_GRANT_SOURCE];

export const PARTS_ACTIVITY_DROP_BASE_BPS_ENV_KEY = "PARTS_ACTIVITY_DROP_BASE_BPS";
/** Roll space for the activity drop. 10000 bps = 100%. */
export const ACTIVITY_DROP_BASIS_POINTS = 10_000;
/** Denominator of the faucet and PTC rate: 30 drops per 100 claims. */
export const ACTIVITY_DROP_REFERENCE_CLAIMS_PER_DAY = 100;
/**
 * 30 of every 100 faucet and PTC claims drop 1 common part.
 */
export const ACTIVITY_DROP_REFERENCE_PARTS_PER_DAY = 30;
/** 3000 bps = 30%. Faucet and PTC. */
export const DEFAULT_ACTIVITY_PART_DROP_BASE_BPS = Math.round(
  (ACTIVITY_DROP_REFERENCE_PARTS_PER_DAY / ACTIVITY_DROP_REFERENCE_CLAIMS_PER_DAY) * ACTIVITY_DROP_BASIS_POINTS,
);
/**
 * Auto-mining, YouTube, and shortlink fire many more claims than the faucet.
 * 1 drop per 10 claims: a 100-claim day expects about 10 parts, a 50-claim shortlink day about 5.
 */
export const FREQUENT_ACTIVITY_DROP_REFERENCE_CLAIMS = 10;
export const FREQUENT_ACTIVITY_DROP_REFERENCE_PARTS = 1;
export const PARTS_FREQUENT_ACTIVITY_DROP_BASE_BPS_ENV_KEY = "PARTS_FREQUENT_ACTIVITY_DROP_BASE_BPS";
/** 1000 bps = 10%. Auto-mining, YouTube, and shortlink. */
export const DEFAULT_FREQUENT_ACTIVITY_DROP_BASE_BPS = Math.round(
  (FREQUENT_ACTIVITY_DROP_REFERENCE_PARTS / FREQUENT_ACTIVITY_DROP_REFERENCE_CLAIMS) * ACTIVITY_DROP_BASIS_POINTS,
);
const FREQUENT_ACTIVITY_SOURCES: ReadonlySet<string> = new Set([
  PART_GRANT_SOURCE.shortlink,
  PART_GRANT_SOURCE.automining,
  PART_GRANT_SOURCE.youtube,
]);
/** Offerwall credits under $0.01. Kept separate from the activity drop base. */
export const OFFERWALL_MICRO_DROP_BPS = 4_000;

export function readPartsPerOfferwallCredit(
  raw: string | undefined | null = process.env[PARTS_PER_OFFERWALL_CREDIT_ENV_KEY],
): number {
  if (raw == null || String(raw).trim() === "") return DEFAULT_PARTS_PER_OFFERWALL_CREDIT;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0) return DEFAULT_PARTS_PER_OFFERWALL_CREDIT;
  return n;
}

export function partSlugForOfferwallCredit(source: string, sourceRef: string): PartSlug {
  const digest = createHash("sha256").update(`${source}:${sourceRef}`).digest();
  const index = digest.readUInt32BE(0) % PART_SLUGS.length;
  return PART_SLUGS[index];
}

/**
 * Drop probability tiers:
 *  - Micro (< $0.01, e.g. Zerads PTC $0.0005): OFFERWALL_MICRO_DROP_BPS chance of 1 part
 *  - Small ($0.01 - $0.10): 75% chance of 1 part
 *  - Medium ($0.10 - $0.50): 100% guaranteed 1 part
 *  - Large ($0.50 - $1.00): 100% guaranteed 1 part + 50% chance for a 2nd part
 *  - High tier (> $1.00): 1 + min(4, floor(usdAmount)) parts guaranteed (up to 5 parts)
 */
export function calculateOfferwallPartDrop(
  source: string,
  sourceRef: string,
  usdAmount?: number | null,
): { dropped: boolean; quantity: number; partSlug: PartSlug } {
  const digest = createHash("sha256").update(`${source}:${sourceRef}`).digest();
  const slugIndex = digest.readUInt32BE(0) % PART_SLUGS.length;
  const partSlug = PART_SLUGS[slugIndex];

  const envDefault = readPartsPerOfferwallCredit();
  if (envDefault === 0) {
    return { dropped: false, quantity: 0, partSlug };
  }

  const val = Number(usdAmount ?? 0);
  const roll = (digest.readUInt32BE(4) % 10000) / 10000; // 0.0000 to 0.9999

  let quantity = 0;

  const microChance = OFFERWALL_MICRO_DROP_BPS / ACTIVITY_DROP_BASIS_POINTS;
  if (!Number.isFinite(val) || val <= 0) {
    quantity = roll < microChance ? 1 : 0;
  } else if (val < 0.01) {
    quantity = roll < microChance ? 1 : 0;
  } else if (val < 0.10) {
    quantity = roll < 0.75 ? 1 : 0;
  } else if (val < 0.50) {
    quantity = 1;
  } else if (val < 1.00) {
    quantity = roll < 0.50 ? 2 : 1;
  } else {
    quantity = Math.min(5, 1 + Math.floor(val));
  }

  return {
    dropped: quantity > 0,
    quantity,
    partSlug,
  };
}

export function readActivityPartDropBaseBps(
  raw: string | undefined | null = process.env[PARTS_ACTIVITY_DROP_BASE_BPS_ENV_KEY],
): number {
  return readDropBps(raw, DEFAULT_ACTIVITY_PART_DROP_BASE_BPS);
}

export function readFrequentActivityDropBaseBps(
  raw: string | undefined | null = process.env[PARTS_FREQUENT_ACTIVITY_DROP_BASE_BPS_ENV_KEY],
): number {
  return readDropBps(raw, DEFAULT_FREQUENT_ACTIVITY_DROP_BASE_BPS);
}

function readDropBps(raw: string | undefined | null, fallback: number): number {
  if (raw == null || String(raw).trim() === "") return fallback;
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 0 || n > ACTIVITY_DROP_BASIS_POINTS) return fallback;
  return n;
}

export function activityDropBaseBps(source: string): number {
  if (FREQUENT_ACTIVITY_SOURCES.has(source)) return readFrequentActivityDropBaseBps();
  return readActivityPartDropBaseBps();
}

/**
 * One common part, or nothing. The same source + sourceRef always rolls the same
 * slug and the same hit, so a retried claim cannot farm a new outcome.
 * `baseBps` overrides the source default (tests). Production callers omit it.
 */
export function calculateActivityPartDrop(
  source: string,
  sourceRef: string,
  baseBps: number = activityDropBaseBps(source),
): { dropped: boolean; quantity: number; partSlug: PartSlug } {
  const digest = createHash("sha256").update(`${source}:${sourceRef}`).digest();
  const partSlug = PART_SLUGS[digest.readUInt32BE(0) % PART_SLUGS.length];
  const bps = Number.isInteger(baseBps) && baseBps >= 0 && baseBps <= ACTIVITY_DROP_BASIS_POINTS
    ? baseBps
    : DEFAULT_ACTIVITY_PART_DROP_BASE_BPS;
  if (bps === 0) return { dropped: false, quantity: 0, partSlug };

  const roll = digest.readUInt32BE(4) % ACTIVITY_DROP_BASIS_POINTS;
  const dropped = roll < bps;
  return { dropped, quantity: dropped ? 1 : 0, partSlug };
}
