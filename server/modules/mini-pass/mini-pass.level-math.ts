/**
 * Level is 1-based. At 0 XP user is level 1 until they cross the first threshold.
 */
export function computePassLevel(totalXp: number, xpPerLevel: number, maxLevel: number): number {
  const xp = Number.isFinite(totalXp) ? Math.max(0, totalXp) : 0;
  const step = Number.isFinite(xpPerLevel) && xpPerLevel > 0 ? xpPerLevel : 1;
  const max = Number.isFinite(maxLevel) && maxLevel > 0 ? maxLevel : 1;
  const lvl = 1 + Math.floor(xp / step);
  return Math.min(max, Math.max(1, lvl));
}

/** XP total needed to sit at max tier (same progression rule as computePassLevel). */
export function xpCapForSeason(maxLevel: number, xpPerLevel: number): number {
  const step = Math.max(1, xpPerLevel);
  return Math.max(0, (Math.max(1, maxLevel) - 1) * step);
}

export function xpRemainingToCap(totalXp: number, maxLevel: number, xpPerLevel: number): number {
  const cap = xpCapForSeason(maxLevel, xpPerLevel);
  return Math.max(0, cap - Math.max(0, totalXp));
}
