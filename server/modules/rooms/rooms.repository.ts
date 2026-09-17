// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../core/database/prisma.js";
import { resolveGrantEventMinerId } from "../machines/eventMinerDisplayName.js";
const roomListSelect = {
    id: true,
    roomNumber: true,
    pricePaid: true,
    unlockedAt: true,
    racks: {
        orderBy: { position: "asc" },
        select: {
            id: true,
            position: true,
            installedAt: true,
            blockedByMinerId: true,
            userMiner: {
                select: {
                    id: true,
                    minerId: true,
                    hashRate: true,
                    imageUrl: true,
                    level: true,
                    slotSize: true,
                    ownedMachineId: true,
                    ownedMachine: { select: { imageUrl: true, minerName: true } },
                    miner: { select: { name: true, imageUrl: true } },
                },
            },
        },
    },
};
export async function findRoomsWithRacksForUser(userId) {
    return prisma.userRoom.findMany({
        where: { userId },
        select: roomListSelect,
        orderBy: { roomNumber: "asc" },
    });
}
export async function findUserRoomsOrdered(userId) {
    return prisma.userRoom.findMany({
        where: { userId },
        orderBy: { roomNumber: "asc" },
    });
}
export async function findUserBlkBalance(userId) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { blkBalance: true },
    });
}
export async function findUserBlkBalanceTx(tx, userId) {
    return tx.user.findUnique({
        where: { id: userId },
        select: { blkBalance: true },
    });
}
export async function findRackWithRoomForUser(rackId, userId) {
    return prisma.userRack.findFirst({
        where: { id: rackId, userId },
        include: { room: true },
    });
}
export async function findInventoryItemForUser(inventoryId, userId) {
    return prisma.userInventory.findFirst({
        where: { id: inventoryId, userId },
        include: {
            miner: { select: { name: true, imageUrl: true } },
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
export async function findRackByRoomAndPosition(roomId, position) {
    return prisma.userRack.findFirst({
        where: { roomId, position },
    });
}
export async function findRackWithMinerForUser(rackId, userId) {
    return prisma.userRack.findFirst({
        where: { id: rackId, userId },
        include: {
            userMiner: {
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
            },
        },
    });
}
export async function countUserRacks(userId) {
    return prisma.userRack.count({ where: { userId } });
}
export async function countOccupiedUserRacks(userId) {
    return prisma.userRack.count({ where: { userId, userMinerId: { not: null } } });
}
export async function countUserInventory(userId) {
    return prisma.userInventory.count({ where: { userId } });
}
export async function findUserMinerSlotSize(minerId) {
    return prisma.userMiner.findUnique({
        where: { id: minerId },
        select: { slotSize: true },
    });
}
export async function clearRackInstallationTx(tx, rackId) {
    await tx.userRack.update({
        where: { id: rackId },
        data: { userMinerId: null, installedAt: null },
    });
}
export async function clearBlockedByMinerTx(tx, roomId, minerId) {
    await tx.userRack.updateMany({
        where: { roomId, blockedByMinerId: minerId },
        data: { blockedByMinerId: null },
    });
}
export async function createInventoryRowFromRackTx(tx, data) {
    await tx.userInventory.create({ data });
}
export async function deleteUserMinerTx(tx, id) {
    await tx.userMiner.delete({ where: { id } });
}
export async function decrementUserBalanceTx(tx, userId, amount) {
    await tx.user.update({
        where: { id: userId },
        data: { blkBalance: { decrement: amount } },
    });
}
export async function createUserRoomTx(tx, data) {
    return tx.userRoom.create({ data });
}
export async function createRacksBatchTx(tx, racksData) {
    await tx.userRack.createMany({ data: racksData });
}
export async function createUserMinerForRackTx(tx, data) {
    return tx.userMiner.create({ data });
}
export async function updateRackInstallationTx(tx, rackId, data) {
    await tx.userRack.update({ where: { id: rackId }, data });
}
export async function setRackBlockedByMinerTx(tx, rackId, minerId) {
    await tx.userRack.update({ where: { id: rackId }, data: { blockedByMinerId: minerId } });
}
export async function deleteInventoryItemByIdTx(tx, inventoryId) {
    await tx.userInventory.delete({ where: { id: inventoryId } });
}
export async function findRacksWithMinersByIdsTx(tx, rackIds, userId) {
    return tx.userRack.findMany({
        where: { id: { in: rackIds }, userId },
        include: {
            userMiner: {
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
            },
        },
    });
}
/** Ensures UserOwnedMachine for inventory row (mirrors inventory.repository). */
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
/** Ensures UserOwnedMachine for rack miner (mirrors machines.repository). */
export async function ensureOwnedMachineForUserMinerTx(tx, m, minerDisplayName) {
    if (m.ownedMachineId != null)
        return m.ownedMachineId;
    const eventMinerId = await resolveGrantEventMinerId(tx, { minerId: m.minerId, minerName: minerDisplayName }, { strict: false });
    const om = await tx.userOwnedMachine.create({
        data: {
            userId: m.userId,
            location: "RACK",
            minerId: m.minerId,
            eventMinerId,
            minerName: minerDisplayName,
            level: m.level ?? 1,
            hashRate: m.hashRate ?? 0,
            slotSize: m.slotSize ?? 1,
            imageUrl: m.imageUrl,
        },
    });
    await tx.userMiner.update({ where: { id: m.id }, data: { ownedMachineId: om.id } });
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
