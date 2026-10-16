import type { PartStackDto } from './parts.types';

export const MERGE_PLATE_COUNT = 2;

export const PART_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

export type PartRarityName = (typeof PART_RARITIES)[number];

export type MergeSlot = {
  slug: string;
  rarity: PartRarityName;
  imageUrl: string;
};

export function partRarity(part: { rarity?: string }): PartRarityName {
  const value = part.rarity ?? '';
  return (PART_RARITIES as readonly string[]).includes(value) ? (value as PartRarityName) : 'common';
}

export function emptySlots(): Array<MergeSlot | null> {
  return [null, null];
}

export function placedCount(slots: readonly (MergeSlot | null)[], slug: string, rarity: string): number {
  return slots.filter((slot) => slot != null && slot.slug === slug && slot.rarity === rarity).length;
}

export function pickPlate(
  slots: readonly (MergeSlot | null)[],
  part: PartStackDto,
): { slots: Array<MergeSlot | null>; mismatch: boolean } {
  const rarity = partRarity(part);
  const next = slots.slice(0, MERGE_PLATE_COUNT);
  while (next.length < MERGE_PLATE_COUNT) next.push(null);
  const used = placedCount(next, part.slug, rarity);
  if (!Number.isFinite(part.quantity) || part.quantity - used < 1) {
    return { slots: next, mismatch: false };
  }
  const emptyIndex = next.findIndex((slot) => slot == null);
  if (emptyIndex < 0) return { slots: next, mismatch: false };
  const filled = next.find((slot) => slot != null);
  if (filled && filled.rarity !== rarity) return { slots: next, mismatch: true };
  next[emptyIndex] = { slug: part.slug, rarity, imageUrl: part.imageUrl };
  return { slots: next, mismatch: false };
}

export function clearSlot(slots: readonly (MergeSlot | null)[], index: number): Array<MergeSlot | null> {
  const next = slots.slice(0, MERGE_PLATE_COUNT);
  while (next.length < MERGE_PLATE_COUNT) next.push(null);
  if (index >= 0 && index < next.length) next[index] = null;
  return next;
}

export function slotsReady(slots: readonly (MergeSlot | null)[], parts: readonly PartStackDto[]): boolean {
  if (slots.length < MERGE_PLATE_COUNT || slots.some((slot) => slot == null)) return false;
  const rarity = slots[0]?.rarity;
  if (!rarity || slots.some((slot) => slot?.rarity !== rarity)) return false;
  const need = new Map<string, number>();
  for (const slot of slots) {
    if (!slot) return false;
    const key = `${slot.slug}:${slot.rarity}`;
    need.set(key, (need.get(key) ?? 0) + 1);
  }
  for (const [key, count] of need) {
    const splitAt = key.indexOf(':');
    const slug = key.slice(0, splitAt);
    const slotRarity = key.slice(splitAt + 1);
    const owned = parts.find((part) => part.slug === slug && partRarity(part) === slotRarity);
    if (!owned || owned.quantity < count) return false;
  }
  return true;
}

export function totalPlatesCount(parts: readonly PartStackDto[]): number {
  return parts.reduce((sum, p) => sum + (Number.isFinite(p.quantity) && p.quantity > 0 ? p.quantity : 0), 0);
}

export function platesByRarity(parts: readonly PartStackDto[]): Record<PartRarityName, number> {
  const counts: Record<PartRarityName, number> = {
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  };
  for (const part of parts) {
    const r = partRarity(part);
    counts[r] += Number.isFinite(part.quantity) && part.quantity > 0 ? part.quantity : 0;
  }
  return counts;
}

export function hasAnyPlatePair(parts: readonly PartStackDto[]): boolean {
  const counts = platesByRarity(parts);
  return Object.values(counts).some((qty) => qty >= MERGE_PLATE_COUNT);
}

export function countMergeableMachines(
  machines: readonly { mergeFeeBlk?: number; mergedHashRate?: number; baseHashRate?: number }[],
  blkBalance: number,
  parts: readonly PartStackDto[],
): number {
  if (!hasAnyPlatePair(parts)) return 0;
  const safeBal = Number.isFinite(blkBalance) && blkBalance > 0 ? blkBalance : 0;
  return machines.filter((m) => {
    const fee = Number(m.mergeFeeBlk ?? 0);
    const boost = Number(m.mergedHashRate ?? 0);
    return boost > 0 && Math.round(safeBal * 100_000_000) >= Math.round(fee * 100_000_000);
  }).length;
}

