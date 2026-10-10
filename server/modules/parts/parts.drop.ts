/**
 * One deterministic part per offerwall credit. The same source + sourceRef
 * always picks the same catalog slug, so a replay cannot reroll the drop.
 */
import { createHash } from "node:crypto";
import { PART_CATALOG, type PartSlug } from "./parts.catalog.js";

export const PARTS_PER_OFFERWALL_CREDIT_ENV_KEY = "PARTS_PER_OFFERWALL_CREDIT";
export const DEFAULT_PARTS_PER_OFFERWALL_CREDIT = 1;

export const PART_GRANT_SOURCE = {
  offerwallme: "offerwallme",
  offerwallgg: "offerwallgg",
  multiwall: "multiwall",
  zerads: "zerads",
  moneyrain: "moneyrain",
  internal: "internal",
} as const;

export type PartGrantSource = (typeof PART_GRANT_SOURCE)[keyof typeof PART_GRANT_SOURCE];

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
  const index = digest.readUInt32BE(0) % PART_CATALOG.length;
  return PART_CATALOG[index].slug;
}
