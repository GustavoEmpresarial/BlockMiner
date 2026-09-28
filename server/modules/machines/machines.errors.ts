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
