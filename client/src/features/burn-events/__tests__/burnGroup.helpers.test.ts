import { describe, expect, it } from 'vitest';
import {
  groupAndSortMachines,
  addOneFromGroup,
  removeOneFromGroup,
  setGroupQuantity,
  autoSelectLowestPower,
  countToMeetRequirement,
  toggleMaxForRequirement,
  burnableLocationI18nKey,
  type RawBurnableMachine,
} from '../lib/burnGroup.helpers';

describe('burnGroup.helpers', () => {
  const sampleMachines: RawBurnableMachine[] = [
    { id: 1, minerName: 'HyperDrill', hashRate: 1500, location: 'INVENTORY', level: 1, imageUrl: null, slotSize: 1 },
    { id: 2, minerName: 'GPU 1 H/s', hashRate: 1, location: 'INVENTORY', level: 1, imageUrl: null, slotSize: 1 },
    { id: 3, minerName: 'GPU 1 H/s', hashRate: 1, location: 'INVENTORY', level: 1, imageUrl: null, slotSize: 1 },
    { id: 4, minerName: 'GPU 1 H/s', hashRate: 1, location: 'INVENTORY', level: 1, imageUrl: null, slotSize: 1 },
    { id: 5, minerName: 'Shortlink Reward', hashRate: 5, location: 'INVENTORY', level: 1, imageUrl: null, slotSize: 1 },
    { id: 6, minerName: 'Shortlink Reward', hashRate: 5, location: 'INVENTORY', level: 1, imageUrl: null, slotSize: 1 },
    { id: 7, minerName: 'Pulse Mini v1', hashRate: 10, location: 'RACK', level: 1, imageUrl: null, slotSize: 1 },
    { id: 8, minerName: 'Pulse Mini v1', hashRate: 10, location: 'INVENTORY', level: 1, imageUrl: null, slotSize: 1 },
    { id: 9, minerName: 'Vault Miner', hashRate: 25, location: 'WAREHOUSE', level: 1, imageUrl: null, slotSize: 1 },
  ];

  it('groups identical machines, excludes RACK, and sorts from lowest to highest hashRate', () => {
    const selected = new Set<number>([2, 3]); // 2 GPUs selected
    const groups = groupAndSortMachines(sampleMachines, selected);

    // RACK excluded → 5 groups:
    // 1) GPU 1 H/s (3)
    // 2) Shortlink Reward 5 H/s (2)
    // 3) Pulse Mini v1 INVENTORY (1)
    // 4) Vault Miner WAREHOUSE (1)
    // 5) HyperDrill 1500 (1)
    expect(groups.length).toBe(5);
    expect(groups.every((g) => g.location !== 'RACK')).toBe(true);

    expect(groups[0]?.hashRate).toBe(1);
    expect(groups[1]?.hashRate).toBe(5);
    expect(groups[2]?.hashRate).toBe(10);
    expect(groups[2]?.location).toBe('INVENTORY');
    expect(groups[3]?.hashRate).toBe(25);
    expect(groups[3]?.location).toBe('WAREHOUSE');
    expect(groups[4]?.hashRate).toBe(1500);

    expect(groups[0]?.minerName).toBe('GPU 1 H/s');
    expect(groups[0]?.availableCount).toBe(3);
    expect(groups[0]?.selectedCount).toBe(2);
  });

  it('addOneFromGroup and removeOneFromGroup increment and decrement selections', () => {
    const groups = groupAndSortMachines(sampleMachines, new Set());
    const gpuGroup = groups[0]!;

    let selected = new Set<number>();
    selected = addOneFromGroup(gpuGroup, selected);
    expect(selected.size).toBe(1);
    expect(selected.has(2)).toBe(true);

    selected = addOneFromGroup(gpuGroup, selected);
    expect(selected.size).toBe(2);

    selected = removeOneFromGroup(gpuGroup, selected);
    expect(selected.size).toBe(1);

    selected = removeOneFromGroup(gpuGroup, selected);
    expect(selected.size).toBe(0);

    selected = removeOneFromGroup(gpuGroup, selected);
    expect(selected.size).toBe(0);
  });

  it('setGroupQuantity sets exact quantity bounded by available count', () => {
    const groups = groupAndSortMachines(sampleMachines, new Set());
    const gpuGroup = groups[0]!; // 3 available

    let selected = setGroupQuantity(gpuGroup, new Set(), 2);
    expect(selected.size).toBe(2);

    selected = setGroupQuantity(gpuGroup, selected, 10);
    expect(selected.size).toBe(3);

    selected = setGroupQuantity(gpuGroup, selected, -5);
    expect(selected.size).toBe(0);
  });

  it('autoSelectLowestPower picks lowest hashrate machines first up to target', () => {
    const groups = groupAndSortMachines(sampleMachines, new Set());
    const selected = autoSelectLowestPower(groups, 8);

    expect(selected.has(2)).toBe(true);
    expect(selected.has(3)).toBe(true);
    expect(selected.has(4)).toBe(true);
    expect(selected.has(5)).toBe(true);
    expect(selected.has(6)).toBe(false);
    expect(selected.has(1)).toBe(false);
    expect(selected.size).toBe(4);
  });

  it('countToMeetRequirement fills only enough units for the remaining H/s', () => {
    const groups = groupAndSortMachines(sampleMachines, new Set());
    const gpuGroup = groups[0]!; // 1 H/s, 3 available
    expect(countToMeetRequirement(gpuGroup, 100, 0)).toBe(3); // capped by available
    expect(countToMeetRequirement(gpuGroup, 2, 0)).toBe(2);
    expect(countToMeetRequirement(gpuGroup, 100, 99)).toBe(1);
    expect(countToMeetRequirement(gpuGroup, 100, 100)).toBe(0);

    const hyper = groups[4]!; // 1500 H/s
    expect(countToMeetRequirement(hyper, 100, 0)).toBe(1); // slight overshoot OK
  });

  it('toggleMaxForRequirement selects just enough then clears on second click', () => {
    const manyGpus: RawBurnableMachine[] = Array.from({ length: 287 }, (_, i) => ({
      id: 1000 + i,
      minerName: 'GPU 1 H/s',
      hashRate: 1,
      location: 'INVENTORY' as const,
      level: 1,
      imageUrl: null,
      slotSize: 1,
    }));
    const groups = groupAndSortMachines(manyGpus, new Set());
    const gpuGroup = groups[0]!;

    let selected = toggleMaxForRequirement(gpuGroup, new Set(), manyGpus, 100);
    expect(selected.size).toBe(100);

    const groupsAfter = groupAndSortMachines(manyGpus, selected);
    selected = toggleMaxForRequirement(groupsAfter[0]!, selected, manyGpus, 100);
    expect(selected.size).toBe(0);
  });

  it('burnableLocationI18nKey maps inventory / vault / rack without duplicating labels', () => {
    expect(burnableLocationI18nKey('WAREHOUSE')).toBe('burnEvents.loc_warehouse');
    expect(burnableLocationI18nKey('RACK')).toBe('burnEvents.loc_rack');
    expect(burnableLocationI18nKey('INVENTORY')).toBe('burnEvents.loc_inventory');
  });
});
