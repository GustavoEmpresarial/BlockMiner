export interface RawBurnableMachine {
  id: number;
  location: 'INVENTORY' | 'RACK' | string;
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
  location: 'INVENTORY' | 'RACK' | string;
  level: number;
  imageUrl: string | null;
  machineIds: number[];
  availableCount: number;
  selectedCount: number;
}

/**
 * Builds unique group key for identical machine models.
 * Groups by name, hashRate, location (rack vs inventory), level, and image.
 */
export function buildGroupKey(m: RawBurnableMachine): string {
  return `${m.minerName}:::${m.hashRate}:::${m.location}:::${m.level}:::${m.imageUrl || ''}`;
}

/**
 * Groups machines of the same model/type and sorts them strictly from
 * LOWEST power to HIGHEST power (hashRate ASC).
 * Tie-breakers: INVENTORY before RACK, then minerName alphabetically.
 */
export function groupAndSortMachines(
  machines: RawBurnableMachine[],
  selectedIds: Set<number>,
): BurnMachineGroup[] {
  const map = new Map<string, BurnMachineGroup>();

  for (const m of machines) {
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
    // Prefer INVENTORY over RACK for convenience
    if (a.location !== b.location) {
      return a.location === 'INVENTORY' ? -1 : 1;
    }
    return a.minerName.localeCompare(b.minerName);
  });

  return groups;
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
