import { requireSessionUser, readErrorCode } from "../../shared/errors/httpStatusError.js";
import { resolveCriticalMutation, finalizeCriticalMutationSuccess, cancelCriticalMutation, } from "../../core/http/middleware/idempotency.js";
import { logger } from "../../core/logger/index.js";
import * as inventoryService from "./inventory.service.js";
import { InventoryItemNotFoundError, InventoryInvalidSlotError } from "./inventory.errors.js";
const log = logger.child("inventory.controller");
export async function getInventory(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const inventory = await inventoryService.listInventoryForUser(user.id);
        res.json({ ok: true, inventory });
    }
    catch (error) {
        log.error("getInventory failed", { error: String(error) });
        res.status(500).json({ ok: false, messageKey: "inventory.errors.load_failed", message: "Unable to load inventory." });
    }
}
export async function installInventoryItem(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const slotIndex = Number(req.body?.slotIndex);
        const inventoryId = Number(req.body?.inventoryId);
        if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 80) {
            res.status(400).json({ ok: false, code: "INVALID_STATE", messageKey: "inventory.errors.invalid_slot", message: "Invalid slotIndex." });
            return;
        }
        if (!Number.isInteger(inventoryId) || inventoryId < 1) {
            res.status(400).json({ ok: false, code: "INVALID_STATE", messageKey: "inventory.errors.invalid_inventory_id", message: "Invalid inventoryId." });
            return;
        }
        const idem = await resolveCriticalMutation(req, res);
        if (!idem)
            return;
        const { lease, ci } = idem;
        try {
            await inventoryService.installInventoryItemForUser(user.id, slotIndex, inventoryId);
            const payload = { ok: true, messageKey: "inventory.install_success", message: "Machine installed successfully!" };
            await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
            res.json(payload);
        }
        catch (error) {
            await cancelCriticalMutation(lease);
            if (error instanceof InventoryItemNotFoundError) {
                res.status(404).json({ ok: false, messageKey: "inventory.errors.item_not_found_in_inventory", message: "Item not found in inventory." });
                return;
            }
            if (error instanceof InventoryInvalidSlotError) {
                res.status(400).json({ ok: false, code: "INVALID_STATE", messageKey: "inventory.errors.slot_taken", message: error.message });
                return;
            }
            if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
                res.status(409).json({ ok: false, code: "RACE_CONDITION_DETECTED", message: "This action conflicted with another request. Refresh the page and try again." });
                return;
            }
            log.error("Install Error:", { error: String(error) });
            res.status(500).json({ ok: false, messageKey: "inventory.errors.install_failed", message: "Internal server error during installation." });
        }
    }
    catch (error) {
        log.error("Install Error:", { error: String(error) });
        res.status(500).json({ ok: false, messageKey: "inventory.errors.install_failed", message: "Internal server error during installation." });
    }
}
export async function removeInventoryItem(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const inventoryId = Number(req.body?.inventoryId);
        if (!Number.isInteger(inventoryId) || inventoryId < 1) {
            res.status(400).json({ ok: false, code: "INVALID_STATE", messageKey: "inventory.errors.invalid_inventory_id", message: "Invalid inventoryId." });
            return;
        }
        const idem = await resolveCriticalMutation(req, res);
        if (!idem)
            return;
        const { lease, ci } = idem;
        try {
            await inventoryService.removeInventoryItemForUser(user.id, inventoryId);
            const payload = { ok: true, messageKey: "inventory.remove_success", message: "Item removed." };
            await finalizeCriticalMutationSuccess(lease, { requestHash: ci.requestHash, responseJson: payload });
            res.json(payload);
        }
        catch (error) {
            await cancelCriticalMutation(lease);
            if (error instanceof InventoryItemNotFoundError) {
                res.status(404).json({ ok: false, messageKey: "inventory.errors.item_not_found", message: "Item not found." });
                return;
            }
            if (readErrorCode(error) === "DISTRIBUTED_LOCK_BUSY") {
                res.status(409).json({ ok: false, code: "RACE_CONDITION_DETECTED", message: "This action conflicted with another request. Refresh the page and try again." });
                return;
            }
            log.error("removeInventoryItem failed", { error: String(error) });
            res.status(500).json({ ok: false, messageKey: "inventory.errors.remove_failed", message: "Error removing item." });
        }
    }
    catch (error) {
        log.error("removeInventoryItem failed", { error: String(error) });
        res.status(500).json({ ok: false, messageKey: "inventory.errors.remove_failed", message: "Error removing item." });
    }
}
/** Legacy is a no-op sync ack — client calls this after local reconciliation, server has nothing to persist. */
export async function updateInventory(_req, res) {
    res.json({ ok: true, messageKey: "inventory.sync_success", message: "Inventory synced." });
}
