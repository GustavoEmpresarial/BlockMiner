import { describe, expect, it } from 'vitest';
import {
  applyOptimisticInstall,
  applyOptimisticInventoryToVault,
  applyOptimisticRackToVault,
  applyOptimisticUninstall,
  applyOptimisticUninstallSlots,
  type FarmSnapshot,
} from './machines.optimistic';
import type { BackpackItem, RoomPayload, UserRackSlot } from './machines.types';

function slot(overrides: Partial<UserRackSlot> = {}): UserRackSlot {
  return { id: 1, position: 0, miner: null, installedAt: null, blockedByMinerId: null, ...overrides };
}

function room(racks: UserRackSlot[], overrides: Partial<RoomPayload> = {}): RoomPayload {
  return { roomNumber: 1, unlocked: true, racks, ...overrides };
}

function backpackItem(overrides: Partial<BackpackItem> = {}): BackpackItem {
  return { id: 10, minerId: 5, minerName: 'Miner', hashRate: 100, slotSize: 1, ...overrides };
}

function baseState(racks: UserRackSlot[], inventory: BackpackItem[] = []): FarmSnapshot {
  return {
    rooms: [room(racks)],
    inventory,
    summary: { totalRacks: racks.length, occupiedRacks: 0, freeRacks: racks.length },
  };
}

describe('applyOptimisticInstall', () => {
  it('installs a 1-slot machine, removes it from inventory, and bumps occupied count', () => {
    const target = slot({ id: 1, position: 0 });
    const item = backpackItem({ id: 10, slotSize: 1 });
    const state = baseState([target], [item, backpackItem({ id: 11 })]);

    const next = applyOptimisticInstall(state, 1, item);

    const rack = (next.rooms[0]!.racks as UserRackSlot[])[0]!;
    expect(rack.miner?.minerName).toBe('Miner');
    expect(next.inventory.map((i) => i.id)).toEqual([11]);
    expect(next.summary.occupiedRacks).toBe(1);
    expect(next.summary.freeRacks).toBe(0);
  });

  it('treats a falsy/absent item.slotSize as 1', () => {
    const target = slot({ id: 1, position: 0 });
    const item = backpackItem({ id: 10, slotSize: undefined });
    const state = baseState([target], [item]);
    const next = applyOptimisticInstall(state, 1, item);
    expect((next.rooms[0]!.racks as UserRackSlot[])[0]!.miner!.slotSize).toBe(1);
  });

  it('installing a 2-slot machine also blocks the adjacent slot in the same row', () => {
    const slots = [slot({ id: 1, position: 0 }), slot({ id: 2, position: 1 })];
    const item = backpackItem({ id: 10, slotSize: 2 });
    const state = baseState(slots, [item]);

    const next = applyOptimisticInstall(state, 1, item);
    const racks = next.rooms[0]!.racks as UserRackSlot[];
    expect(racks[0]!.miner).toBeTruthy();
    expect(racks[1]!.blockedByMinerId).toBe(racks[0]!.miner!.id);
    expect(next.summary.occupiedRacks).toBe(2);
  });

  it('installing a 2-slot machine does not double-count occupancy if the adjacent slot was already marked blocked', () => {
    const slots = [slot({ id: 1, position: 0 }), slot({ id: 2, position: 1, blockedByMinerId: 999 })];
    const item = backpackItem({ id: 10, slotSize: 2 });
    const state: FarmSnapshot = {
      ...baseState(slots, [item]),
      summary: { totalRacks: 2, occupiedRacks: 1, freeRacks: 1 },
    };
    const next = applyOptimisticInstall(state, 1, item);
    // Only the primary slot's occupancy is new; the adjacent one was already counted.
    expect(next.summary.occupiedRacks).toBe(2);
  });

  it('does not double-count occupancy if the target slot was already occupied', () => {
    const target = slot({ id: 1, position: 0, miner: { id: 99, hashRate: 5 } });
    const item = backpackItem({ id: 10, slotSize: 1 });
    const state: FarmSnapshot = {
      ...baseState([target], [item]),
      summary: { totalRacks: 1, occupiedRacks: 1, freeRacks: 0 },
    };
    const next = applyOptimisticInstall(state, 1, item);
    expect(next.summary.occupiedRacks).toBe(1);
  });

  it('leaves unrelated slots (neither the target nor its adjacent slot) untouched', () => {
    const untouched = slot({ id: 3, position: 5, miner: { id: 555, hashRate: 1 } });
    const slots = [slot({ id: 1, position: 0 }), slot({ id: 2, position: 1 }), untouched];
    const item = backpackItem({ id: 10, slotSize: 1 });
    const state = baseState(slots, [item]);
    const next = applyOptimisticInstall(state, 1, item);
    expect((next.rooms[0]!.racks as UserRackSlot[])[2]).toEqual(untouched);
  });

  it('is a no-op on rooms when the rackId does not match any slot', () => {
    const target = slot({ id: 1, position: 0 });
    const item = backpackItem({ id: 10 });
    const state = baseState([target], [item]);
    const next = applyOptimisticInstall(state, 999, item);
    expect(next.rooms[0]!.racks).toEqual([target]);
  });

  it('never touches a locked (unlocked: false) room', () => {
    const target = slot({ id: 1, position: 0 });
    const item = backpackItem({ id: 10 });
    const state: FarmSnapshot = {
      rooms: [room([target], { unlocked: false })],
      inventory: [item],
      summary: { totalRacks: 1, occupiedRacks: 0, freeRacks: 1 },
    };
    const next = applyOptimisticInstall(state, 1, item);
    expect(next.rooms[0]!.racks).toEqual([target]);
  });
});

describe('applyOptimisticUninstall', () => {
  it('clears the rack and returns the machine to inventory', () => {
    const occupied = slot({ id: 1, position: 0, miner: { id: 42, minerName: 'X', hashRate: 10 } });
    const state: FarmSnapshot = {
      ...baseState([occupied]),
      summary: { totalRacks: 1, occupiedRacks: 1, freeRacks: 0 },
    };
    const next = applyOptimisticUninstall(state, 1);
    const rack = (next.rooms[0]!.racks as UserRackSlot[])[0]!;
    expect(rack.miner).toBeNull();
    expect(next.inventory).toHaveLength(1);
    expect(next.inventory[0]!.minerName).toBe('X');
    expect(next.summary.occupiedRacks).toBe(0);
    expect(next.summary.freeRacks).toBe(1);
  });

  it('backpackFromMiner keeps an already-negative miner id as-is (no double negation)', () => {
    const occupied = slot({ id: 1, position: 0, miner: { id: -42, minerName: 'Optimistic Ghost', hashRate: 10 } });
    const state: FarmSnapshot = { ...baseState([occupied]), summary: { totalRacks: 1, occupiedRacks: 1, freeRacks: 0 } };
    const next = applyOptimisticUninstall(state, 1);
    expect(next.inventory[0]!.id).toBe(-42);
  });

  it('clears both slots of a 2-slot machine (primary + blocked)', () => {
    const primary = slot({ id: 1, position: 0, miner: { id: 42, minerName: 'Big', hashRate: 500, slotSize: 2 } });
    const blocked = slot({ id: 2, position: 1, blockedByMinerId: 42 });
    const state: FarmSnapshot = {
      ...baseState([primary, blocked]),
      summary: { totalRacks: 2, occupiedRacks: 2, freeRacks: 0 },
    };
    const next = applyOptimisticUninstall(state, 1);
    const racks = next.rooms[0]!.racks as UserRackSlot[];
    expect(racks[0]!.miner).toBeNull();
    expect(racks[1]!.blockedByMinerId).toBeNull();
    expect(next.summary.occupiedRacks).toBe(0);
    expect(next.inventory).toHaveLength(1);
  });

  it('is a no-op when the target rack is empty', () => {
    const empty = slot({ id: 1, position: 0 });
    const state = baseState([empty]);
    const next = applyOptimisticUninstall(state, 1);
    expect(next.inventory).toEqual([]);
    expect(next.summary.occupiedRacks).toBe(0);
  });
});

describe('applyOptimisticUninstallSlots (batch dismantle)', () => {
  it('clears multiple independent machines, leaves an unrelated rack untouched, returns all cleared to inventory', () => {
    const s1 = slot({ id: 1, position: 0, miner: { id: 1, minerName: 'A', hashRate: 1 } });
    const s2 = slot({ id: 2, position: 1, miner: { id: 2, minerName: 'B', hashRate: 2 } });
    const untouched = slot({ id: 3, position: 2, miner: { id: 3, minerName: 'C', hashRate: 3 } });
    const state: FarmSnapshot = {
      ...baseState([s1, s2, untouched]),
      summary: { totalRacks: 3, occupiedRacks: 3, freeRacks: 0 },
    };
    const next = applyOptimisticUninstallSlots(state, [{ miner: { id: 1 } }, { miner: { id: 2 } }]);
    expect(next.inventory).toHaveLength(2);
    expect(next.summary.occupiedRacks).toBe(1);
    expect((next.rooms[0]!.racks as UserRackSlot[])[2]).toEqual(untouched);
  });

  it('returns the same state reference when no valid miner ids are found', () => {
    const state = baseState([slot()]);
    const next = applyOptimisticUninstallSlots(state, [{ miner: null, blockedByMinerId: null }]);
    expect(next).toBe(state);
  });

  it('accepts a slot identified only by blockedByMinerId (the non-primary half of a 2-slot machine)', () => {
    const blockedOnly = slot({ id: 2, position: 1, blockedByMinerId: 77 });
    const state = baseState([blockedOnly]);
    const next = applyOptimisticUninstallSlots(state, [{ miner: null, blockedByMinerId: 77 }]);
    // clearMinersFromRacks only pushes to `returned` for a matching `slot.miner`, so a
    // blockedByMinerId-only match clears the slot's block flag but adds nothing to inventory.
    expect((next.rooms[0]!.racks as UserRackSlot[])[0]!.blockedByMinerId).toBeNull();
    expect(next.inventory).toEqual(state.inventory);
  });

  it('keeps the original inventory array reference when nothing gets returned to it', () => {
    const s1 = slot({ id: 1, position: 0, blockedByMinerId: 5 });
    const state = baseState([s1], []);
    const next = applyOptimisticUninstallSlots(state, [{ miner: null, blockedByMinerId: 5 }]);
    expect(next.inventory).toBe(state.inventory);
  });
});

describe('applyOptimisticInventoryToVault', () => {
  it('removes the given ids from inventory and leaves rooms untouched', () => {
    const state = baseState([slot()], [backpackItem({ id: 1 }), backpackItem({ id: 2 }), backpackItem({ id: 3 })]);
    const next = applyOptimisticInventoryToVault(state, [1, 3]);
    expect(next.inventory.map((i) => i.id)).toEqual([2]);
    expect(next.rooms).toBe(state.rooms);
  });
});

describe('applyOptimisticRackToVault', () => {
  it('clears the rack and decrements occupancy WITHOUT adding the machine back to inventory', () => {
    const occupied = slot({ id: 1, position: 0, miner: { id: 7, hashRate: 10 } });
    const state: FarmSnapshot = {
      ...baseState([occupied]),
      summary: { totalRacks: 1, occupiedRacks: 1, freeRacks: 0 },
    };
    const next = applyOptimisticRackToVault(state, 7);
    const rack = (next.rooms[0]!.racks as UserRackSlot[])[0]!;
    expect(rack.miner).toBeNull();
    expect(next.inventory).toEqual([]);
    expect(next.summary.occupiedRacks).toBe(0);
  });
});

describe('occupancy/free-rack invariant', () => {
  it('freeRacks never goes negative even if occupiedRacks would exceed totalRacks', () => {
    const target = slot({ id: 1, position: 0 });
    const item = backpackItem({ id: 10 });
    const state: FarmSnapshot = {
      ...baseState([target], [item]),
      summary: { totalRacks: 0, occupiedRacks: 0, freeRacks: 0 },
    };
    const next = applyOptimisticInstall(state, 1, item);
    expect(next.summary.freeRacks).toBeGreaterThanOrEqual(0);
    expect(next.summary.occupiedRacks).toBeGreaterThanOrEqual(0);
  });
});
