import { describe, expect, it } from 'vitest';
import {
  groupAndSortMachines,
  addOneFromGroup,
  removeOneFromGroup,
  setGroupQuantity,
  autoSelectLowestPower,
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
  ];

  it('groups identical machines together and sorts from lowest to highest hashRate', () => {
    const selected = new Set<number>([2, 3]); // 2 GPUs selected
    const groups = groupAndSortMachines(sampleMachines, selected);

    // Should have 5 distinct groups:
    // 1) GPU 1 H/s (3 items)
    // 2) Shortlink Reward 5 H/s (2 items)
    // 3) Pulse Mini v1 10 H/s (INVENTORY, 1 item)
    // 4) Pulse Mini v1 10 H/s (RACK, 1 item)
    // 5) HyperDrill 1500 H/s (1 item)
    expect(groups.length).toBe(5);

    // Check strict ascending sort:
    expect(groups[0]?.hashRate).toBe(1);
    expect(groups[1]?.hashRate).toBe(5);
    expect(groups[2]?.hashRate).toBe(10);
    expect(groups[2]?.location).toBe('INVENTORY');
    expect(groups[3]?.hashRate).toBe(10);
    expect(groups[3]?.location).toBe('RACK');
    expect(groups[4]?.hashRate).toBe(1500);

    // Group 0 should have 3 available and 2 selected
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

    // Removing when 0 doesn't crash
    selected = removeOneFromGroup(gpuGroup, selected);
    expect(selected.size).toBe(0);
  });

  it('setGroupQuantity sets exact quantity bounded by available count', () => {
    const groups = groupAndSortMachines(sampleMachines, new Set());
    const gpuGroup = groups[0]!; // 3 available

    let selected = setGroupQuantity(gpuGroup, new Set(), 2);
    expect(selected.size).toBe(2);

    // Capped at 3
    selected = setGroupQuantity(gpuGroup, selected, 10);
    expect(selected.size).toBe(3);

    // Lower bound 0
    selected = setGroupQuantity(gpuGroup, selected, -5);
    expect(selected.size).toBe(0);
  });

  it('autoSelectLowestPower picks lowest hashrate machines first up to target', () => {
    const groups = groupAndSortMachines(sampleMachines, new Set());
    // Target: 8 H/s
    // Should pick 3x GPU (3 * 1 = 3 H/s) + 1x Shortlink (5 H/s) = 8 H/s total!
    const selected = autoSelectLowestPower(groups, 8);

    expect(selected.has(2)).toBe(true);
    expect(selected.has(3)).toBe(true);
    expect(selected.has(4)).toBe(true);
    expect(selected.has(5)).toBe(true); // 1 Shortlink
    expect(selected.has(6)).toBe(false); // 2nd Shortlink not needed
    expect(selected.has(1)).toBe(false); // Hyperdrill not picked
    expect(selected.size).toBe(4);
  });
});
