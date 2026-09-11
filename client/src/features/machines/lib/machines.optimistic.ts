import type { BackpackItem, RoomPayload, RoomsSummaryState, UserRackSlot } from './machines.types';

export type FarmSnapshot = {
  rooms: RoomPayload[];
  inventory: BackpackItem[];
  summary: RoomsSummaryState;
};

function mapUnlockedRacks(rooms: RoomPayload[], mapRacks: (racks: UserRackSlot[]) => UserRackSlot[]): RoomPayload[] {
  return rooms.map((room) => {
    if (!room.unlocked || !('racks' in room) || !room.racks) return room;
    return { ...room, racks: mapRacks(room.racks) };
  });
}

function bumpSummary(summary: RoomsSummaryState, occupiedDelta: number): RoomsSummaryState {
  const occupiedRacks = Math.max(0, summary.occupiedRacks + occupiedDelta);
  const freeRacks = Math.max(0, summary.totalRacks - occupiedRacks);
  return { ...summary, occupiedRacks, freeRacks };
}

function slotOccupied(slot: UserRackSlot): boolean {
  return Boolean(slot.miner || slot.blockedByMinerId);
}

function backpackFromMiner(miner: NonNullable<UserRackSlot['miner']>): BackpackItem {
  return {
    id: miner.id > 0 ? -miner.id : miner.id,
    minerId: miner.minerId,
    minerName: miner.minerName,
    level: miner.level,
    hashRate: miner.hashRate,
    slotSize: miner.slotSize,
    imageUrl: miner.imageUrl,
    imageSource: miner.imageSource,
  };
}

export function applyOptimisticInstall(state: FarmSnapshot, rackId: number, item: BackpackItem): FarmSnapshot {
  let occupiedDelta = 0;
  const rooms = mapUnlockedRacks(state.rooms, (racks) => {
    const target = racks.find((slot) => slot.id === rackId);
    if (!target) return racks;
    const slotSize = Math.max(1, Number(item.slotSize) || 1);
    const miner: NonNullable<UserRackSlot['miner']> = {
      id: -item.id,
      minerId: item.minerId,
      minerName: item.minerName,
      hashRate: item.hashRate,
      imageUrl: item.imageUrl,
      imageSource: item.imageSource,
      ownedMachineId: null,
      level: item.level,
      slotSize,
    };
    return racks.map((slot) => {
      if (slot.id === rackId) {
        if (!slotOccupied(slot)) occupiedDelta += 1;
        return { ...slot, miner, installedAt: new Date().toISOString(), blockedByMinerId: null };
      }
      if (slotSize >= 2 && slot.position === target.position + (slotSize - 1)) {
        if (!slotOccupied(slot)) occupiedDelta += 1;
        return { ...slot, blockedByMinerId: miner.id };
      }
      return slot;
    });
  });
  return {
    rooms,
    inventory: state.inventory.filter((row) => row.id !== item.id),
    summary: bumpSummary(state.summary, occupiedDelta),
  };
}

function clearMinersFromRacks(racks: UserRackSlot[], minerIds: Set<number>): { racks: UserRackSlot[]; returned: BackpackItem[]; occupiedDelta: number } {
  const returned: BackpackItem[] = [];
  let occupiedDelta = 0;
  const next = racks.map((slot) => {
    const minerId = slot.miner?.id;
    const blocked = slot.blockedByMinerId;
    const hit = (minerId != null && minerIds.has(minerId)) || (blocked != null && minerIds.has(blocked));
    if (!hit) return slot;
    if (slot.miner && minerId != null && minerIds.has(minerId)) returned.push(backpackFromMiner(slot.miner));
    if (slotOccupied(slot)) occupiedDelta -= 1;
    return { ...slot, miner: null, installedAt: null, blockedByMinerId: null };
  });
  return { racks: next, returned, occupiedDelta };
}

export function applyOptimisticUninstall(state: FarmSnapshot, rackId: number): FarmSnapshot {
  let returned: BackpackItem[] = [];
  let occupiedDelta = 0;
  const rooms = mapUnlockedRacks(state.rooms, (racks) => {
    const target = racks.find((slot) => slot.id === rackId);
    const minerId = target?.miner?.id ?? target?.blockedByMinerId;
    if (minerId == null) return racks;
    const cleared = clearMinersFromRacks(racks, new Set([minerId]));
    returned = returned.concat(cleared.returned);
    occupiedDelta += cleared.occupiedDelta;
    return cleared.racks;
  });
  return {
    rooms,
    inventory: returned.length ? [...returned, ...state.inventory] : state.inventory,
    summary: bumpSummary(state.summary, occupiedDelta),
  };
}

export function applyOptimisticUninstallSlots(
  state: FarmSnapshot,
  slots: Array<{ miner?: { id?: unknown } | null; blockedByMinerId?: number | null }>,
): FarmSnapshot {
  const minerIds = new Set<number>();
  for (const slot of slots) {
    const minerId = Number(slot.miner?.id);
    if (Number.isInteger(minerId) && minerId !== 0) minerIds.add(minerId);
    else if (slot.blockedByMinerId != null) minerIds.add(slot.blockedByMinerId);
  }
  if (minerIds.size === 0) return state;
  let returned: BackpackItem[] = [];
  let occupiedDelta = 0;
  const rooms = mapUnlockedRacks(state.rooms, (racks) => {
    const cleared = clearMinersFromRacks(racks, minerIds);
    returned = returned.concat(cleared.returned);
    occupiedDelta += cleared.occupiedDelta;
    return cleared.racks;
  });
  return {
    rooms,
    inventory: returned.length ? [...returned, ...state.inventory] : state.inventory,
    summary: bumpSummary(state.summary, occupiedDelta),
  };
}

export function applyOptimisticInventoryToVault(state: FarmSnapshot, inventoryIds: number[]): FarmSnapshot {
  const drop = new Set(inventoryIds);
  return { ...state, inventory: state.inventory.filter((row) => !drop.has(row.id)) };
}

export function applyOptimisticRackToVault(state: FarmSnapshot, userMinerId: number): FarmSnapshot {
  let occupiedDelta = 0;
  const rooms = mapUnlockedRacks(state.rooms, (racks) => {
    const cleared = clearMinersFromRacks(racks, new Set([userMinerId]));
    occupiedDelta += cleared.occupiedDelta;
    return cleared.racks;
  });
  return {
    rooms,
    inventory: state.inventory,
    summary: bumpSummary(state.summary, occupiedDelta),
  };
}
