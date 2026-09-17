// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../../core/database/prisma.js";
import { resolveGrantEventMinerId } from "../../machines/eventMinerDisplayName.js";
export async function listVault(userId) {
    return prisma.userVault.findMany({
        where: { userId },
        select: {
            id: true,
            userId: true,
            minerId: true,
            minerName: true,
            level: true,
            hashRate: true,
            slotSize: true,
            imageUrl: true,
            storedAt: true,
            ownedMachineId: true,
            miner: { select: { name: true, imageUrl: true } },
            ownedMachine: {
                select: {
                    minerName: true,
                    imageUrl: true,
                    eventMiner: { select: { name: true, imageUrl: true } },
                },
            },
        },
        orderBy: { storedAt: "asc" },
    });
}
export async function findInventoryItem(userId, id) {
    return prisma.userInventory.findFirst({ where: { id, userId } });
}
export async function findVaultItem(userId, id) {
    return prisma.userVault.findFirst({ where: { id, userId } });
}
async function ensureOwnedMachineForInventoryRowTx(tx, item) {
    if (item.ownedMachineId != null)
        return item.ownedMachineId;
    const eventMinerId = await resolveGrantEventMinerId(tx, item, { strict: false });
    const om = await tx.userOwnedMachine.create({
        data: {
            userId: item.userId,
            location: "INVENTORY",
            minerId: item.minerId,
            eventMinerId,
            minerName: item.minerName,
            level: item.level ?? 1,
            hashRate: item.hashRate ?? 0,
            slotSize: item.slotSize ?? 1,
            imageUrl: item.imageUrl,
        },
    });
    await tx.userInventory.update({ where: { id: item.id }, data: { ownedMachineId: om.id } });
    return om.id;
}
/** Core move inventory→vault inside a caller-owned tx (preserves ownedMachineId). */
export async function moveInventoryItemToVaultInTx(tx, userId, inventoryId) {
    const item = await tx.userInventory.findFirst({ where: { id: inventoryId, userId } });
    if (!item)
        throw new Error("NOT_FOUND");
    const omId = await ensureOwnedMachineForInventoryRowTx(tx, item);
    await tx.userVault.create({
        data: {
            userId,
            minerId: item.minerId,
            minerName: item.minerName,
            level: item.level,
            hashRate: item.hashRate,
            slotSize: item.slotSize,
            imageUrl: item.imageUrl,
            storedAt: new Date(),
            ownedMachineId: omId,
        },
    });
    await tx.userOwnedMachine.update({
        where: { id: omId },
        data: {
            location: "WAREHOUSE",
            minerId: item.minerId,
            minerName: item.minerName,
            level: item.level,
            hashRate: item.hashRate,
            slotSize: item.slotSize ?? 1,
            imageUrl: item.imageUrl,
        },
    });
    await tx.userInventory.delete({ where: { id: inventoryId } });
}
/** Moves one inventory row into the vault (warehouse) atomically — preserves ownedMachineId. */
export async function moveInventoryItemToVaultTx(userId, inventoryId) {
    return prisma.$transaction(async (tx) => {
        await moveInventoryItemToVaultInTx(tx, userId, inventoryId);
    });
}
// ─── Rack <-> vault tx-scoped helpers (used from a caller-owned prisma.$transaction
// alongside machines/index.ts calls, so a rack move and the UserVault write commit
// atomically together) ───────────────────────────────────────────────────────────
/** Same shape as findVaultItem, but runs inside the caller's tx. */
export async function findVaultItemTx(tx, userId, id) {
    return tx.userVault.findFirst({ where: { id, userId } });
}
export async function createVaultRowTx(tx, data) {
    return tx.userVault.create({ data });
}
/** Caller must have already verified ownership (e.g. via findVaultItemTx) before calling this. */
export async function deleteVaultRowTx(tx, vaultId) {
    await tx.userVault.delete({ where: { id: vaultId } });
}
/**
 * Lazily backfills the canonical `UserOwnedMachine` row for a vault item that
 * predates it. Prefer carrying ownedMachineId on every vault write; this is the
 * safety net for legacy/null rows.
 */
export async function ensureOwnedMachineForVaultRowTx(tx, vaultItem) {
    if (vaultItem.ownedMachineId != null)
        return vaultItem.ownedMachineId;
    const eventMinerId = await resolveGrantEventMinerId(tx, vaultItem, { strict: false });
    const om = await tx.userOwnedMachine.create({
        data: {
            userId: vaultItem.userId,
            location: "WAREHOUSE",
            minerId: vaultItem.minerId,
            eventMinerId,
            minerName: vaultItem.minerName,
            level: vaultItem.level ?? 1,
            hashRate: vaultItem.hashRate ?? 0,
            slotSize: vaultItem.slotSize ?? 1,
            imageUrl: vaultItem.imageUrl,
        },
    });
    await tx.userVault.update({ where: { id: vaultItem.id }, data: { ownedMachineId: om.id } });
    return om.id;
}
/** Core move vault→inventory inside a caller-owned tx — preserves ownedMachineId. */
export async function retrieveVaultItemToInventoryInTx(tx, userId, vaultId) {
    const item = await tx.userVault.findFirst({ where: { id: vaultId, userId } });
    if (!item)
        throw new Error("NOT_FOUND");
    const omId = await ensureOwnedMachineForVaultRowTx(tx, item);
    await tx.userInventory.create({
        data: {
            userId,
            minerId: item.minerId,
            minerName: item.minerName,
            level: item.level,
            hashRate: item.hashRate,
            slotSize: item.slotSize,
            imageUrl: item.imageUrl,
            acquiredAt: new Date(),
            ownedMachineId: omId,
        },
    });
    await tx.userOwnedMachine.update({
        where: { id: omId },
        data: {
            location: "INVENTORY",
            minerId: item.minerId,
            minerName: item.minerName,
            level: item.level,
            hashRate: item.hashRate,
            slotSize: item.slotSize ?? 1,
            imageUrl: item.imageUrl,
        },
    });
    await tx.userVault.delete({ where: { id: vaultId } });
}
/** Moves one vault row back into inventory atomically — preserves ownedMachineId. */
export async function retrieveVaultItemToInventoryTx(userId, vaultId) {
    return prisma.$transaction(async (tx) => {
        await retrieveVaultItemToInventoryInTx(tx, userId, vaultId);
    });
}
