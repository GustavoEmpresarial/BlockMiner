/** Module-wide machines types. Ported (trimmed) from legacy machineModel/machines.controller. */
/** Max addressable rack slot (0..79), mirrors legacy machines.controller moveMachine bound check. */
export const MAX_SLOT_INDEX = 80;

/** Ported from the inline check in legacy machines.controller.ts `moveMachine`. */
export function isValidSlotIndex(targetSlotIndex: number): boolean {
  return Number.isInteger(targetSlotIndex) && targetSlotIndex >= 0 && targetSlotIndex < MAX_SLOT_INDEX;
}

/** Ported from the inline check in legacy machines.controller.ts `moveMachine`: 2-slot machines must start on an even slot. */
export function isValidSlotForSize(targetSlotIndex: number, slotSize: number): boolean {
  if (!isValidSlotIndex(targetSlotIndex)) return false;
  if (slotSize === 2 && targetSlotIndex % 2 !== 0) return false;
  return true;
}

/** Ported from machines.service.ts `moveMachineForUser` (target slot range for a slotSize-N machine). */
export function computeTargetSlots(targetSlotIndex: number, slotSize: number): number[] {
  return Array.from({ length: slotSize }, (_, i) => targetSlotIndex + i);
}

export type MachineDisplaySource = "none" | "catalog_current" | "owned_snapshot";

export interface ResolvedMachineDisplay {
  name: string;
  imageUrl: string | null;
  imageSource: MachineDisplaySource;
  hashRate: number;
  level: number;
  slotSize: number;
}
