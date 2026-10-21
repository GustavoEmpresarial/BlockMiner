/**
 * 5-tier machine fusion specification (RollerCoin-style):
 * Each merge consumes 2 IDENTICAL machines of the current level.
 * The resulting upgraded machine produces the combined power of both machines PLUS the tier boost:
 *   Level 1: Common (Comum)       - Base power (1x base), Gray/White
 *   Level 2: Uncommon (Incomum)   - 2x Common + 30% boost  -> 2.60x base (Green)
 *   Level 3: Rare (Raro)          - 2x Uncommon + 25% boost -> 6.50x base (Blue)
 *   Level 4: Epic (Épico)         - 2x Rare + 25% boost     -> 16.25x base (Purple)
 *   Level 5: Legendary (Lendário) - 2x Epic + 25% boost     -> 40.63x base (Gold/Amber)
 */
import type { PartRarity, PartSlug } from "./parts.catalog.js";

export type MachineRarityTier = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type TierPartRequirement = {
  slug: PartSlug;
  rarity: PartRarity;
  required: number;
};

export type MergeTierDef = {
  level: number;
  tier: MachineRarityTier;
  labelKey: string;
  name: string;
  color: string;
  hashMultiplier: number;
  boostPercent: number;
  /** Forge tournament points earned by a merge that reaches this tier. */
  tournamentPoints: number;
  partsRequired: TierPartRequirement[];
};

export const MACHINE_MERGE_TIERS: Record<number, MergeTierDef> = {
  1: {
    level: 1,
    tier: "common",
    labelKey: "parts.rarity.common",
    name: "Common",
    color: "#94A3B8",
    hashMultiplier: 1.0,
    boostPercent: 0,
    tournamentPoints: 0,
    partsRequired: [],
  },
  2: {
    level: 2,
    tier: "uncommon",
    labelKey: "parts.rarity.uncommon",
    name: "Uncommon",
    color: "#10B981",
    hashMultiplier: 2.60, // 2x Common + 30% bonus
    boostPercent: 30,
    tournamentPoints: 1,
    partsRequired: [
      { slug: "power_cable", rarity: "common", required: 4 },
      { slug: "asic_chip", rarity: "common", required: 2 },
      { slug: "cooling_fan", rarity: "common", required: 2 },
    ],
  },
  3: {
    level: 3,
    tier: "rare",
    labelKey: "parts.rarity.rare",
    name: "Rare",
    color: "#38BDF8",
    hashMultiplier: 6.50, // 2x Uncommon (5.20) + 25% bonus
    boostPercent: 25,
    tournamentPoints: 3,
    partsRequired: [
      { slug: "power_cable", rarity: "uncommon", required: 6 },
      { slug: "asic_chip", rarity: "uncommon", required: 4 },
      { slug: "hashboard", rarity: "uncommon", required: 2 },
      { slug: "power_supply", rarity: "uncommon", required: 1 },
    ],
  },
  4: {
    level: 4,
    tier: "epic",
    labelKey: "parts.rarity.epic",
    name: "Epic",
    color: "#A855F7",
    hashMultiplier: 16.25, // 2x Rare (13.00) + 25% bonus
    boostPercent: 25,
    tournamentPoints: 8,
    partsRequired: [
      { slug: "power_cable", rarity: "rare", required: 8 },
      { slug: "asic_chip", rarity: "rare", required: 6 },
      { slug: "hashboard", rarity: "rare", required: 3 },
      { slug: "power_supply", rarity: "rare", required: 2 },
      { slug: "thermal_pad", rarity: "rare", required: 2 },
    ],
  },
  5: {
    level: 5,
    tier: "legendary",
    labelKey: "parts.rarity.legendary",
    name: "Legendary",
    color: "#F59E0B",
    hashMultiplier: 40.625, // 2x Epic (32.50) + 25% bonus
    boostPercent: 25,
    tournamentPoints: 20,
    partsRequired: [
      { slug: "power_cable", rarity: "epic", required: 12 },
      { slug: "asic_chip", rarity: "epic", required: 10 },
      { slug: "hashboard", rarity: "epic", required: 4 },
      { slug: "power_supply", rarity: "epic", required: 3 },
      { slug: "thermal_pad", rarity: "epic", required: 4 },
    ],
  },
};

export const MAX_MERGE_LEVEL = 5;

export function getTierForLevel(level: number): MergeTierDef {
  const clamped = Math.max(1, Math.min(MAX_MERGE_LEVEL, Math.floor(level || 1)));
  return MACHINE_MERGE_TIERS[clamped] ?? MACHINE_MERGE_TIERS[1];
}

export function calculateMergedHashrate(baseHashRate: number, targetLevel: number): number {
  if (!Number.isFinite(baseHashRate) || baseHashRate <= 0) return 0;
  const tier = getTierForLevel(targetLevel);
  return Math.round(baseHashRate * tier.hashMultiplier * 100) / 100;
}

/** Level-1 equivalent of an owned machine's real hashrate at `currentLevel`. */
export function levelOneHashrateFromOwned(ownedHashRate: number, currentLevel: number): number {
  if (!Number.isFinite(ownedHashRate) || ownedHashRate <= 0) return 0;
  return ownedHashRate / getTierForLevel(currentLevel).hashMultiplier;
}
