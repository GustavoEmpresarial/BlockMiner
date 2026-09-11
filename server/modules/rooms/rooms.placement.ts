/**
 * Pure placement/validation logic for room rack slots — no I/O.
 * Ported from legacy/server/modules/rooms/domain/rooms.placement.ts.
 */
import { RACK_VISUAL_COLUMNS, RACKS_PER_ROOM } from "./rooms.types.js";

export type RackOccupancyState = {
  userMinerId: number | null;
  blockedByMinerId: number | null;
};

export function isRackSlotOccupied(rack: RackOccupancyState): boolean {
  return rack.userMinerId != null || rack.blockedByMinerId != null;
}

export function rackSlotIndex(roomNumber: number, position: number, racksPerRoom = RACKS_PER_ROOM): number {
  return 1000 + (roomNumber - 1) * racksPerRoom + position;
}

export function isTwoSlotSpillFromPrevious(prevMinerSlotSize: number | null | undefined): boolean {
  return (prevMinerSlotSize ?? 1) >= 2;
}

export function isRowEdgeViolation(
  position: number,
  slotSize: number,
  visualColumns = RACK_VISUAL_COLUMNS,
): boolean {
  return slotSize >= 2 && position % visualColumns > visualColumns - slotSize;
}
