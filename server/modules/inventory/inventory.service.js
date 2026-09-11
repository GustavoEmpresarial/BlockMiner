/**
 * Ported from legacy/server/modules/inventory/application/inventory.service.ts.
 *
 * FIX (item 88, matches modules/machines/machines.service.ts): legacy calls
 * `syncUserBaseHashRate()` + `miningEngine.reloadMinerProfile()` after a successful install
 * to keep the in-memory mining engine's hashrate in sync. That was a documented TODO here
 * on the grounds that inventory/ must not import mining/ internals — stale reasoning:
 * `mining/index.ts` IS mining's public surface, and rooms/rooms.service.ts has called
 * `miningEngine.reloadMinerProfile` across this exact boundary since item 45. Unwired, this
 * was the most user-visible earnings bug in the codebase: a player buys a machine, installs
 * it from the inventory, and it contributes ZERO hashrate until the server restarts, because
 * the engine caches `baseHashRate` per user and never re-reads the DB for an already-loaded
 * miner. Same bug class as items 45 and 74.
 *
 * Advisory/row locking is still deferred — see inventory.repository.ts header.
 */
import prisma from "../../core/database/prisma.js";
import * as inventoryRepo from "./inventory.repository.js";
import { InventoryItemNotFoundError, InventoryInvalidSlotError } from "./inventory.errors.js";
import { resolveOwnedMachineDisplay } from "../machines/ownedMachineDisplay.js";
import { computeTargetSlots, normalizePersistableMinerImageUrl, resolveOwnedMachineImageUrl } from "./inventory.types.js";
import { displaceRackMinerToInventoryTx } from "../machines/index.js";
import { miningEngine } from "../mining/index.js";
/** Best-effort engine resync — DB já commitou, falha aqui não pode virar erro de request. */
async function resyncEngine(userId) {
    try {
        await miningEngine.reloadMinerProfile(userId);
    }
    catch {
        /* engine cache resync is best-effort — DB is already the source of truth */
    }
}
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
export async function installInventoryItemForUser(userId, slotIndex, inventoryId) {
    const now = new Date();
    const { minerName } = await prisma.$transaction(async (tx) => {
        const inventoryItem = await inventoryRepo.findInventoryItemWithRelationsTx(tx, userId, inventoryId);
        if (!inventoryItem)
            throw new InventoryItemNotFoundError();
        const display = resolveOwnedMachineDisplay({
            minerId: inventoryItem.minerId,
            rowName: inventoryItem.minerName,
            rowImageUrl: inventoryItem.imageUrl,
            catalogName: inventoryItem.miner?.name,
            catalogImageUrl: inventoryItem.miner?.imageUrl,
            ownedName: inventoryItem.ownedMachine?.minerName,
            ownedImageUrl: inventoryItem.ownedMachine?.imageUrl,
            eventName: inventoryItem.ownedMachine?.eventMiner?.name,
            eventImageUrl: inventoryItem.ownedMachine?.eventMiner?.imageUrl,
        });
        const resolvedInstallImage = resolveOwnedMachineImageUrl({
            rowImageUrl: inventoryItem.imageUrl,
            ownedMachineImageUrl: display.imageUrl,
            catalogImageUrl: inventoryItem.miner?.imageUrl ?? inventoryItem.ownedMachine?.eventMiner?.imageUrl ?? null,
        });
        const persistImageUrl = normalizePersistableMinerImageUrl(resolvedInstallImage.imageUrl);
        const slotSize = Number(inventoryItem.slotSize || 1);
        if (slotSize === 2 && slotIndex % 2 !== 0) {
            throw new InventoryInvalidSlotError();
        }
        const targetSlots = computeTargetSlots(slotIndex, slotSize);
        const existingMachines = await inventoryRepo.findOverlappingUserMinersTx(tx, userId, targetSlots);
        for (const m of existingMachines) {
            await displaceRackMinerToInventoryTx(tx, m, now);
        }
        if (slotIndex % 2 === 1) {
            const prevMachine = await inventoryRepo.findPrevSlotMachineTx(tx, userId, slotIndex - 1);
            if (prevMachine && prevMachine.slotSize === 2) {
                await displaceRackMinerToInventoryTx(tx, prevMachine, now);
            }
        }
        const omId = await inventoryRepo.ensureOwnedMachineForInventoryTx(tx, inventoryItem);
        await inventoryRepo.createUserMinerFromInventoryTx(tx, {
            userId,
            slotIndex,
            level: inventoryItem.level,
            hashRate: inventoryItem.hashRate,
            isActive: true,
            slotSize,
            minerId: inventoryItem.minerId,
            imageUrl: persistImageUrl,
            ownedMachineId: omId,
        });
        await inventoryRepo.syncOwnedMachineSnapshotTx(tx, omId, "RACK", {
            minerId: inventoryItem.minerId,
            minerName: inventoryItem.minerName,
            level: inventoryItem.level,
            hashRate: inventoryItem.hashRate,
            slotSize: inventoryItem.slotSize ?? 1,
            imageUrl: persistImageUrl,
        });
        await inventoryRepo.deleteInventoryItemTx(tx, userId, inventoryId);
        return { minerName: inventoryItem.minerName };
    });
    await resyncEngine(userId);
    return { minerName };
}
/**
 * Public cross-module entry point: grants `quantity` inventory items from a template,
 * inside the CALLER's transaction (e.g. shop/'s purchase transaction, which already
 * holds its own lock + balance-debit in the same `tx`). This is the one function other
 * modules are allowed to call on inventory/ for "give this user N machines" — everything
 * else about inventory (install/remove/list) stays behind this module's own boundary.
 */
export async function grantPurchasedInventoryItems(tx, userId, template, quantity, now) {
    await inventoryRepo.bulkCreateInventoryWithOwnedMachinesTx(tx, userId, template, quantity, now);
}
export async function removeInventoryItemForUser(userId, inventoryId) {
    await prisma.$transaction(async (tx) => {
        const row = await inventoryRepo.findInventoryItemBasicTx(tx, userId, inventoryId);
        if (!row)
            throw new InventoryItemNotFoundError();
        await inventoryRepo.deleteInventoryItemTx(tx, userId, inventoryId);
        if (row.ownedMachineId != null) {
            await inventoryRepo.deleteOwnedMachineTx(tx, row.ownedMachineId);
        }
    });
}
