/** Module-wide inventory error codes. Ported from legacy/server/modules/inventory/domain/inventory.errors.ts. */
export const INVENTORY_ERROR = {
    NOT_FOUND: "INVENTORY_NOT_FOUND",
    INVALID_SLOT: "INVENTORY_INVALID_SLOT",
    RACE_CONDITION_DETECTED: "RACE_CONDITION_DETECTED",
};
export class InventoryItemNotFoundError extends Error {
    http = 404;
    code = INVENTORY_ERROR.NOT_FOUND;
    constructor(message = "Item not found in inventory.") {
        super(message);
        this.name = "InventoryItemNotFoundError";
    }
}
export class InventoryInvalidSlotError extends Error {
    http = 400;
    code = INVENTORY_ERROR.INVALID_SLOT;
    constructor(message = "Large machines must start on an even slot (1, 3, 5, 7 on UI).") {
        super(message);
        this.name = "InventoryInvalidSlotError";
    }
}
