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

export const PART_CATALOG: readonly { slug: PartSlug; imageFile: string }[] = [
  { slug: "power_cable", imageFile: "power_cable.jpg" },
  { slug: "asic_chip", imageFile: "asic_chip.jpg" },
  { slug: "cooling_fan", imageFile: "cooling_fan.jpg" },
  { slug: "hashboard", imageFile: "hashboard.jpg" },
  { slug: "power_supply", imageFile: "power_supply.jpg" },
  { slug: "thermal_pad", imageFile: "thermal_pad.jpg" },
];

export function isPartSlug(value: string): value is PartSlug {
  return (PART_SLUGS as readonly string[]).includes(value);
}

export function partImageUrl(slug: PartSlug): string {
  const row = PART_CATALOG.find((part) => part.slug === slug);
  return mediaPublicPath(PART_IMAGE_CATEGORY, row?.imageFile ?? `${slug}.jpg`);
}
