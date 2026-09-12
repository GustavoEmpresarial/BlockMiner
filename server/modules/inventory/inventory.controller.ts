import { requireSessionUser } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import * as inventoryService from "./inventory.service.js";
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
