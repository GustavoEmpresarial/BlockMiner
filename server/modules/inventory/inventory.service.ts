/**
 * Ported from legacy/server/modules/inventory/application/inventory.service.ts.
 *
 * `installInventoryItemForUser` / `removeInventoryItemForUser` were removed (see
 * inventory.routes.ts header) — the real install/uninstall flow lives in
 * rooms/rooms.service.ts (`installMinerForUser` / `uninstallMinerForUser`), which
 * the client actually calls. This module keeps only what's live: listing the
 * backpack, and the cross-module grant entry point used by shop/rewards/register.
 */
import * as inventoryRepo from "./inventory.repository.js";
import { resolveOwnedMachineDisplay } from "../machines/ownedMachineDisplay.js";
import { resolveOwnedMachineImageUrl } from "./inventory.types.js";

export async function listInventoryForUser(userId) {
    const rows = await inventoryRepo.listInventory(userId);
    return rows.map((row) => {
        const { ownedMachine, miner, ...rest } = row;
        const display = resolveOwnedMachineDisplay({
            minerId: row.minerId,
            rowName: row.minerName,
            rowImageUrl: row.imageUrl,
            catalogName: miner?.name,
            catalogImageUrl: miner?.imageUrl,
            ownedName: ownedMachine?.minerName,
            ownedImageUrl: ownedMachine?.imageUrl,
            eventName: ownedMachine?.eventMiner?.name,
            eventImageUrl: ownedMachine?.eventMiner?.imageUrl,
        });
        const { imageUrl, imageSource } = resolveOwnedMachineImageUrl({
            rowImageUrl: row.imageUrl,
            ownedMachineImageUrl: display.imageUrl,
            catalogImageUrl: miner?.imageUrl ?? ownedMachine?.eventMiner?.imageUrl ?? null,
        });
        return {
            ...rest,
            minerName: display.minerName,
            ownedMachineId: rest.ownedMachineId ?? ownedMachine?.id ?? null,
            imageUrl,
            imageSource,
        };
    });
}

/**
 * Public cross-module entry point: grants `quantity` inventory items from a template,
 * inside the CALLER's transaction (e.g. shop/'s purchase transaction, which already
 * holds its own lock + balance-debit in the same `tx`). This is the one function other
 * modules are allowed to call on inventory/ for "give this user N machines" — everything
 * else about inventory (list) stays behind this module's own boundary.
 */
export async function grantPurchasedInventoryItems(tx, userId, template, quantity, now) {
    await inventoryRepo.bulkCreateInventoryWithOwnedMachinesTx(tx, userId, template, quantity, now);
}
