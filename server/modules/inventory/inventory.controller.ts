import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { reportError } from "../../core/errors/error-reporter.js";
import * as inventoryService from "./inventory.service.js";
export async function getInventory(req, res) {
    try {
        const user = requireSessionUser(req, res);
        if (!user)
            return;
        const inventory = await inventoryService.listInventoryForUser(user.id);
        res.json({ ok: true, inventory });
    }
    catch (error) {
        reportError({
            code: "INVENTORY_LIST_FAILED",
            category: "DATABASE",
            severity: "ERROR",
            module: "inventory.list",
            error,
            req,
        });
        res.status(500).json({ ok: false, messageKey: "inventory.errors.load_failed", message: "Unable to load inventory." });
    }
}
