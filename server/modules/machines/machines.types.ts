// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Module-wide machines types. Ported (trimmed) from legacy machineModel/machines.controller. */
/** Max addressable rack slot (0..79), mirrors legacy machines.controller moveMachine bound check. */
export const MAX_SLOT_INDEX = 80;
/** Ported from the inline check in legacy machines.controller.ts `moveMachine`. */
export function isValidSlotIndex(targetSlotIndex) {
    return Number.isInteger(targetSlotIndex) && targetSlotIndex >= 0 && targetSlotIndex < MAX_SLOT_INDEX;
}
/** Ported from the inline check in legacy machines.controller.ts `moveMachine`: 2-slot machines must start on an even slot. */
export function isValidSlotForSize(targetSlotIndex, slotSize) {
    if (!isValidSlotIndex(targetSlotIndex))
        return false;
    if (slotSize === 2 && targetSlotIndex % 2 !== 0)
        return false;
    return true;
}
/** Ported from machines.service.ts `moveMachineForUser` (target slot range for a slotSize-N machine). */
export function computeTargetSlots(targetSlotIndex, slotSize) {
    return Array.from({ length: slotSize }, (_, i) => targetSlotIndex + i);
}
