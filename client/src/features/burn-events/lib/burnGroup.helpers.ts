/** Burnable locations: off-rack only (inventory + vault/warehouse). */
export const BURNABLE_LOCATIONS = ['INVENTORY', 'WAREHOUSE'] as const;
export type BurnableLocation = (typeof BURNABLE_LOCATIONS)[number];

export function isBurnableLocation(location: string): location is BurnableLocation {
  return (BURNABLE_LOCATIONS as readonly string[]).includes(location);
}

export function burnableLocationI18nKey(location: string): string {
  if (location === 'WAREHOUSE') return 'burnEvents.loc_warehouse';
  if (location === 'RACK') return 'burnEvents.loc_rack';
  return 'burnEvents.loc_inventory';
}

export interface RawBurnableMachine {
  id: number;
  location: BurnableLocation | 'RACK' | string;
  minerName: string;
  hashRate: number;
  slotSize: number;
  imageUrl: string | null;
  level: number;
}

export interface BurnMachineGroup {
  groupKey: string;
  minerName: string;
  hashRate: number;
  location: BurnableLocation | 'RACK' | string;
  level: number;
  imageUrl: string | null;
  machineIds: number[];
  availableCount: number;
  selectedCount: number;
}

/**
 * Builds unique group key for identical machine models.
 * Groups by name, hashRate, location (inventory vs warehouse), level, and image.
 */
export function buildGroupKey(m: RawBurnableMachine): string {
  return `${m.minerName}:::${m.hashRate}:::${m.location}:::${m.level}:::${m.imageUrl || ''}`;
}

/**
 * Groups machines of the same model/type and sorts them strictly from
 * LOWEST power to HIGHEST power (hashRate ASC).
 * Tie-breakers: INVENTORY before WAREHOUSE, then minerName alphabetically.
 * RACK (and other non-burnable locations) are excluded.
 */
export function groupAndSortMachines(
  machines: RawBurnableMachine[],
  selectedIds: Set<number>,
): BurnMachineGroup[] {
  const map = new Map<string, BurnMachineGroup>();

  for (const m of machines) {
    if (!isBurnableLocation(m.location)) continue;
    const key = buildGroupKey(m);
    let group = map.get(key);
    if (!group) {
      group = {
        groupKey: key,
        minerName: m.minerName,
        hashRate: Number(m.hashRate) || 0,
        location: m.location,
        level: m.level,
        imageUrl: m.imageUrl,
        machineIds: [],
        availableCount: 0,
        selectedCount: 0,
      };
      map.set(key, group);
    }
    group.machineIds.push(m.id);
  }

  const groups = Array.from(map.values());

  for (const g of groups) {
    g.availableCount = g.machineIds.length;
    g.selectedCount = g.machineIds.filter((id) => selectedIds.has(id)).length;
  }

  // Sort: menor poder pra maior poder (hashRate ASC)
  groups.sort((a, b) => {
    if (a.hashRate !== b.hashRate) {
      return a.hashRate - b.hashRate;
    }
    // Prefer INVENTORY over WAREHOUSE for convenience
    if (a.location !== b.location) {
      return a.location === 'INVENTORY' ? -1 : 1;
    }
    return a.minerName.localeCompare(b.minerName);
  });

  return groups;
}

/**
 * How many units from this group are needed (on top of hash already selected
 * outside the group) to reach `requiredHashRate`. Caps at availableCount.
 * May slightly overshoot when the last unit is larger than the remaining gap.
 */
export function countToMeetRequirement(
  group: Pick<BurnMachineGroup, 'hashRate' | 'availableCount'>,
  requiredHashRate: number,
  otherSelectedHashRate: number,
): number {
  const remaining = Math.max(0, Number(requiredHashRate) - Number(otherSelectedHashRate));
  const unit = Number(group.hashRate) || 0;
  if (remaining <= 0 || unit <= 0 || group.availableCount <= 0) return 0;
  const needed = Math.ceil(remaining / unit);
  return Math.min(group.availableCount, needed);
}

/**
 * Hash rate currently selected excluding machines that belong to `group`.
 */
export function hashRateOutsideGroup(
  group: Pick<BurnMachineGroup, 'machineIds'>,
  machines: RawBurnableMachine[],
  currentSelected: Set<number>,
): number {
  const inGroup = new Set(group.machineIds);
  let total = 0;
  for (const m of machines) {
    if (!currentSelected.has(m.id) || inGroup.has(m.id)) continue;
    total += Number(m.hashRate) || 0;
  }
  return total;
}

/**
 * Max toggle target for a group: fill just enough to meet the burn requirement
 * (or clear if already at/above that fill for this group).
 */
export function toggleMaxForRequirement(
  group: BurnMachineGroup,
  currentSelected: Set<number>,
  machines: RawBurnableMachine[],
  requiredHashRate: number,
): Set<number> {
  const otherHash = hashRateOutsideGroup(group, machines, currentSelected);
  const target = countToMeetRequirement(group, requiredHashRate, otherHash);
  if (group.selectedCount > 0 && group.selectedCount >= target) {
    return setGroupQuantity(group, currentSelected, 0);
  }
  return setGroupQuantity(group, currentSelected, target);
}

/**
 * Adds +1 machine from this group to the selected set.
 */
export function addOneFromGroup(group: BurnMachineGroup, currentSelected: Set<number>): Set<number> {
  const next = new Set(currentSelected);
  const unselectedId = group.machineIds.find((id) => !next.has(id));
  if (unselectedId != null) {
    next.add(unselectedId);
  }
  return next;
}

/**
 * Removes -1 machine of this group from the selected set.
 */
export function removeOneFromGroup(group: BurnMachineGroup, currentSelected: Set<number>): Set<number> {
  const next = new Set(currentSelected);
  // Remove last selected ID
  for (let i = group.machineIds.length - 1; i >= 0; i--) {
    const id = group.machineIds[i]!;
    if (next.has(id)) {
      next.delete(id);
      break;
    }
  }
  return next;
}

/**
 * Sets exact quantity of machines selected for a given group.
 */
export function setGroupQuantity(
  group: BurnMachineGroup,
  currentSelected: Set<number>,
  targetCount: number,
): Set<number> {
  const next = new Set(currentSelected);
  const clamped = Math.max(0, Math.min(group.availableCount, Math.floor(targetCount)));

  // Remove all current IDs of this group
  for (const id of group.machineIds) {
    next.delete(id);
  }

  // Add the requested clamped count
  for (let i = 0; i < clamped; i++) {
    next.add(group.machineIds[i]!);
  }

  return next;
}

/**
 * Automatically selects machines starting from lowest power (hashRate ASC)
 * until the required targetHashRate is satisfied.
 */
export function autoSelectLowestPower(
  groups: BurnMachineGroup[],
  targetHashRate: number,
): Set<number> {
  const selected = new Set<number>();
  let accumulatedHashRate = 0;

  for (const group of groups) {
    if (accumulatedHashRate >= targetHashRate) break;

    for (const id of group.machineIds) {
      if (accumulatedHashRate >= targetHashRate) break;
      selected.add(id);
      accumulatedHashRate += group.hashRate;
    }
  }

  return selected;
}
