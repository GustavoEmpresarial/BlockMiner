/**
 * Machine rarity comes from the merge level stored on every owned machine (1..5).
 * Mirrors MACHINE_MERGE_TIERS on the server (server/modules/parts/parts.merge-tiers.ts).
 */
export type MachineRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type MachineRarityStyle = {
  rarity: MachineRarity;
  level: number;
  labelKey: string;
  /** Pill: background + text + border. */
  badge: string;
  /** Card border for list rows and the rack slot frame. */
  border: string;
  /** Solid color for small accents (rack corner dot). */
  dot: string;
};

const BY_LEVEL: Record<number, MachineRarityStyle> = {
  1: {
    rarity: 'common',
    level: 1,
    labelKey: 'parts.rarity.common',
    badge: 'bg-slate-700 text-slate-100 border-slate-500/60',
    border: 'border-slate-700/80',
    dot: 'bg-slate-400',
  },
  2: {
    rarity: 'uncommon',
    level: 2,
    labelKey: 'parts.rarity.uncommon',
    badge: 'bg-emerald-800 text-emerald-100 border-emerald-500/60',
    border: 'border-emerald-500/60',
    dot: 'bg-emerald-400',
  },
  3: {
    rarity: 'rare',
    level: 3,
    labelKey: 'parts.rarity.rare',
    badge: 'bg-sky-800 text-sky-100 border-sky-400/60',
    border: 'border-sky-500/60',
    dot: 'bg-sky-400',
  },
  4: {
    rarity: 'epic',
    level: 4,
    labelKey: 'parts.rarity.epic',
    badge: 'bg-violet-800 text-violet-100 border-violet-400/60',
    border: 'border-violet-500/60',
    dot: 'bg-violet-400',
  },
  5: {
    rarity: 'legendary',
    level: 5,
    labelKey: 'parts.rarity.legendary',
    badge: 'bg-amber-700 text-amber-50 border-amber-400/70',
    border: 'border-amber-500/70',
    dot: 'bg-amber-400',
  },
};

export function machineRarityStyle(level: unknown): MachineRarityStyle {
  const n = Math.trunc(Number(level));
  if (!Number.isFinite(n) || n < 1) return BY_LEVEL[1];
  return BY_LEVEL[Math.min(n, 5)];
}

const TIER_SUFFIX = / \((Common|Uncommon|Rare|Epic|Legendary)\)$/;

/** Merged machines are stored as "Name (Uncommon)"; the badge already shows the rarity. */
export function stripRaritySuffix(name: string): string {
  return name.replace(TIER_SUFFIX, '');
}
