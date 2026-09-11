import prisma from "../../core/database/prisma.js";
import { resolveGrantEventMinerId } from "../machines/eventMinerDisplayName.js";
export async function listInventory(userId) {
    return prisma.userInventory.findMany({
        where: { userId },
        include: {
            ownedMachine: {
                select: {
                    id: true,
                    imageUrl: true,
                    minerName: true,
                    eventMiner: { select: { name: true, imageUrl: true } },
                },
            },
            miner: { select: { imageUrl: true, name: true } },
        },
        orderBy: { acquiredAt: "asc" },
    });
}
export async function findInventoryItemWithRelationsTx(tx, userId, inventoryId) {
    return tx.userInventory.findFirst({
        where: { id: inventoryId, userId },
        include: {
            ownedMachine: {
                select: {
                    id: true,
                    imageUrl: true,
                    minerName: true,
                    eventMiner: { select: { name: true, imageUrl: true } },
                },
            },
            miner: { select: { imageUrl: true, name: true } },
        },
    });
}
export async function findInventoryItemBasicTx(tx, userId, inventoryId) {
    return tx.userInventory.findFirst({
        where: { id: inventoryId, userId },
        select: { id: true, ownedMachineId: true },
    });
}
export async function deleteInventoryItemTx(tx, userId, inventoryId) {
    await tx.userInventory.delete({ where: { id: inventoryId, userId } });
}
export async function deleteOwnedMachineTx(tx, ownedMachineId) {
    await tx.userOwnedMachine.delete({ where: { id: ownedMachineId } });
}
export async function findOverlappingUserMinersTx(tx, userId, targetSlots) {
    return tx.userMiner.findMany({
        where: { userId, slotIndex: { in: targetSlots } },
        include: {
            miner: true,
            ownedMachine: {
                select: {
                    minerName: true,
                    imageUrl: true,
                    eventMiner: { select: { name: true, imageUrl: true } },
                },
            },
        },
    });
}
export async function findPrevSlotMachineTx(tx, userId, slotIndex) {
    return tx.userMiner.findFirst({
        where: { userId, slotIndex },
        include: {
            miner: true,
            ownedMachine: {
                select: {
                    minerName: true,
                    imageUrl: true,
                    eventMiner: { select: { name: true, imageUrl: true } },
                },
            },
        },
    });
}
export async function deleteUserMinerTx(tx, id) {
    await tx.userMiner.delete({ where: { id } });
}
/** Ported from legacy utils/rackMinerRelease.ts `releaseUserMinerFromRacksTx` (also duplicated in machines.repository.ts as `clearRackReferencesTx`). */
export async function releaseUserMinerFromRacksTx(tx, userMinerId) {
    await tx.userRack.updateMany({
        where: { userMinerId },
        data: { userMinerId: null, installedAt: null },
    });
    await tx.userRack.updateMany({
        where: { blockedByMinerId: userMinerId },
        data: { blockedByMinerId: null },
    });
}
export async function createUserMinerFromInventoryTx(tx, data) {
    await tx.userMiner.create({ data });
}
/**
 * Ensures a `UserOwnedMachine` row exists for an inventory row, creating one on first
 * install (Option B canonical-row pattern, ported from
 * userOwnedMachineService.ensureOwnedMachineForInventoryTx).
 */
export async function ensureOwnedMachineForInventoryTx(tx, row) {
    if (row.ownedMachineId != null)
        return row.ownedMachineId;
    const eventMinerId = await resolveGrantEventMinerId(tx, row, { strict: false });
    const om = await tx.userOwnedMachine.create({
        data: {
            userId: row.userId,
            location: "INVENTORY",
            minerId: row.minerId,
            eventMinerId,
            minerName: row.minerName,
            level: row.level ?? 1,
            hashRate: row.hashRate ?? 0,
            slotSize: row.slotSize ?? 1,
            imageUrl: row.imageUrl,
        },
    });
    await tx.userInventory.update({ where: { id: row.id }, data: { ownedMachineId: om.id } });
    return om.id;
}
export async function syncOwnedMachineSnapshotTx(tx, ownedMachineId, location, snapshot) {
    await tx.userOwnedMachine.update({
        where: { id: ownedMachineId },
        data: {
            location,
            minerId: snapshot.minerId,
            minerName: snapshot.minerName,
            level: snapshot.level,
            hashRate: snapshot.hashRate,
            slotSize: snapshot.slotSize,
            imageUrl: snapshot.imageUrl,
        },
    });
}
/** Creates a new inventory row from an overlapping/displaced rack machine, alongside its owned-machine row. */
export async function createInventoryWithOwnedMachineTx(tx, payload) {
    const eventMinerId = await resolveGrantEventMinerId(tx, payload, { strict: false });
    const om = await tx.userOwnedMachine.create({
        data: {
            userId: payload.userId,
            location: "INVENTORY",
            minerId: payload.minerId,
            eventMinerId,
            minerName: payload.minerName,
            level: payload.level ?? 1,
            hashRate: payload.hashRate ?? 0,
            slotSize: payload.slotSize ?? 1,
            imageUrl: payload.imageUrl,
            snapshotSlug: payload.snapshotSlug ?? null,
            snapshotPrice: payload.snapshotPrice ?? null,
            acquisitionSource: payload.acquisitionSource ?? null,
        },
    });
    await tx.userInventory.create({
        data: {
            userId: payload.userId,
            minerId: payload.minerId,
            minerName: payload.minerName,
            level: payload.level,
            hashRate: payload.hashRate,
            slotSize: payload.slotSize,
            imageUrl: payload.imageUrl,
            acquiredAt: payload.acquiredAt,
            expiresAt: payload.expiresAt ?? undefined,
            ownedMachineId: om.id,
        },
    });
    return om.id;
}
/** Bulk variant — creates `quantity` identical inventory+owned-machine rows from one template. Used by shop/ on purchase. */
export async function bulkCreateInventoryWithOwnedMachinesTx(tx, userId, template, quantity, now) {
    for (let i = 0; i < quantity; i++) {
        await createInventoryWithOwnedMachineTx(tx, {
            userId,
            minerName: template.minerName,
            hashRate: template.hashRate,
            level: template.level ?? 1,
            slotSize: template.slotSize ?? 1,
            minerId: template.minerId,
            eventMinerId: template.eventMinerId,
            imageUrl: template.imageUrl,
            snapshotSlug: template.snapshotSlug ?? null,
            snapshotPrice: template.snapshotPrice ?? null,
            acquisitionSource: template.acquisitionSource ?? null,
            acquiredAt: now,
            updatedAt: now,
        });
    }
}
