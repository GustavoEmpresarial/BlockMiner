/**
 * Common machine parts. Images ship in storage/media-seed/parts and are served
 * from /media/parts. These are not fanCredits or rackCredits.
 */
import { mediaPublicPath } from "../media/media.config.js";

export const PART_IMAGE_CATEGORY = "parts";

export const PART_SLUGS = [
  "power_cable",
  "asic_chip",
  "cooling_fan",
  "hashboard",
  "power_supply",
  "thermal_pad",
] as const;

export type PartSlug = (typeof PART_SLUGS)[number];

/**
 * Same sprite layout at every tier.
 * White common, green uncommon, blue rare, pink epic, yellow legendary.
 */
export const PART_RARITY = {
  common: "common",
  uncommon: "uncommon",
  rare: "rare",
  epic: "epic",
  legendary: "legendary",
} as const;

export type PartRarity = (typeof PART_RARITY)[keyof typeof PART_RARITY];

export const PART_RARITIES = [
  PART_RARITY.common,
  PART_RARITY.uncommon,
  PART_RARITY.rare,
  PART_RARITY.epic,
  PART_RARITY.legendary,
] as const;

const PART_IMAGE_SUFFIX: Record<PartRarity, string> = {
  common: "w",
  uncommon: "u",
  rare: "rare",
  epic: "epic",
  legendary: "legend",
};

function partImageFile(slug: PartSlug, rarity: PartRarity): string {
  return `${slug}_${PART_IMAGE_SUFFIX[rarity]}.png`;
}

export const PART_CATALOG: readonly { slug: PartSlug; rarity: PartRarity; imageFile: string }[] = PART_SLUGS.flatMap(
  (slug) =>
    PART_RARITIES.map((rarity) => ({
      slug,
      rarity,
      imageFile: partImageFile(slug, rarity),
    })),
);

export function isPartSlug(value: string): value is PartSlug {
  return (PART_SLUGS as readonly string[]).includes(value);
}

export function isPartRarity(value: string): value is PartRarity {
  return (PART_RARITIES as readonly string[]).includes(value);
}

export function partImageUrl(slug: PartSlug, rarity: PartRarity = PART_RARITY.common): string {
  return mediaPublicPath(PART_IMAGE_CATEGORY, partImageFile(slug, rarity));
}
