// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Module-wide machines error codes. Ported from legacy machines.controller.ts inline error handling. */
export const MACHINES_ERROR = {
    MACHINE_NOT_FOUND: "MACHINES_MACHINE_NOT_FOUND",
    INVALID_SLOT: "MACHINES_INVALID_SLOT",
    RACE_CONDITION_DETECTED: "RACE_CONDITION_DETECTED",
};
export class MachineNotFoundError extends Error {
    http = 404;
    code = MACHINES_ERROR.MACHINE_NOT_FOUND;
    constructor(message = "Machine not found.") {
        super(message);
        this.name = "MachineNotFoundError";
    }
}
export class InvalidSlotError extends Error {
    http = 400;
    code = MACHINES_ERROR.INVALID_SLOT;
    constructor(message = "Invalid target slot.") {
        super(message);
        this.name = "InvalidSlotError";
    }
}
