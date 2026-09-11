// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../core/database/prisma.js";
import { resolveGrantEventMinerId } from "./eventMinerDisplayName.js";
import { ownedMachineDisplaySelect, resolveOwnedMachineDisplay } from "./ownedMachineDisplay.js";
const rackMinerInclude = {
    miner: { select: { name: true, imageUrl: true } },
    ownedMachine: { select: ownedMachineDisplaySelect },
};
function mapRackMinerDisplay(m) {
    const display = resolveOwnedMachineDisplay({
        minerId: m.minerId,
        rowImageUrl: m.imageUrl,
        catalogName: m.miner?.name,
        catalogImageUrl: m.miner?.imageUrl,
        ownedName: m.ownedMachine?.minerName,
        ownedImageUrl: m.ownedMachine?.imageUrl,
        eventName: m.ownedMachine?.eventMiner?.name,
        eventImageUrl: m.ownedMachine?.eventMiner?.imageUrl,
    });
    return { ...m, miner_name: display.minerName, image_url: display.imageUrl };
}
export async function listUserMachines(userId) {
    const machines = await prisma.userMiner.findMany({
        where: { userId },
        include: rackMinerInclude,
        orderBy: { slotIndex: "asc" },
    });
    return machines.map((m) => mapRackMinerDisplay(m));
}
export async function findMachineById(userId, machineId) {
    const m = await prisma.userMiner.findFirst({
        where: { id: machineId, userId },
        include: rackMinerInclude,
    });
    if (!m)
        return null;
    return mapRackMinerDisplay(m);
}
/** Pre-transaction read: full row + miner relation (legacy `findFullMinerWithMinerInfo`). */
export async function findFullMinerWithMinerInfo(userId, machineId) {
    return prisma.userMiner.findFirst({
        where: { id: machineId, userId },
        include: rackMinerInclude,
    });
}
/**
 * Tx-scoped read + write helpers below exist so other modules (wallet/vault) can
 * compose a rack <-> vault move inside their own `prisma.$transaction`, without
 * duplicating rack-release / owned-machine-sync logic that already lives here
 * (see machines.service.ts moveMachineForUser / removeMachineToInventory for the
 * rack <-> inventory equivalents this mirrors). This keeps `UserMiner`/`UserRack`
 * mutations owned by machines/, consumed by other modules only through
 * `machines/index.ts` — the module-boundary rule from docs/ARQUITETURA.md.
 */
/** Same as findFullMinerWithMinerInfo, but runs inside a caller-supplied tx (for atomicity with a non-machines write, e.g. vault). */
export async function findFullMinerWithMinerInfoTx(tx, userId, machineId) {
    return tx.userMiner.findFirst({
        where: { id: machineId, userId },
        include: rackMinerInclude,
    });
}
/** Tx-scoped variant of findOverlappingMachines, without the excludeMachineId filter (used when creating a brand-new rack row from the vault, so there is no "self" to exclude). */
export async function findOverlappingMachinesTx(tx, userId, targetSlots) {
    return tx.userMiner.findMany({
        where: { userId, slotIndex: { in: targetSlots } },
        include: rackMinerInclude,
    });
}
/** Creates a brand-new rack (`UserMiner`) row at a specific slot — the inverse of deleteUserMinerTx, used when retrieving a vault item straight into a rack slot. */
export async function createUserMinerAtSlotTx(tx, data) {
    return tx.userMiner.create({ data });
}
export async function findOverlappingMachines(userId, targetSlots, excludeMachineId) {
    return prisma.userMiner.findMany({
        where: { userId, slotIndex: { in: targetSlots }, id: { not: excludeMachineId } },
        include: rackMinerInclude,
    });
}
/** All `Tx` functions below run inside the caller's `prisma.$transaction`. */
export async function updateMachineActiveTx(tx, userId, machineId, isActive) {
    await tx.userMiner.update({ where: { id: machineId, userId }, data: { isActive } });
}
export async function deleteUserMinerTx(tx, machineId) {
    await tx.userMiner.delete({ where: { id: machineId } });
}
export async function updateMachineSlotIndexTx(tx, machineId, targetSlotIndex) {
    await tx.userMiner.update({ where: { id: machineId }, data: { slotIndex: targetSlotIndex } });
}
export async function findPrevSlotMachineTx(tx, userId, slotIndex, excludeMachineId) {
    return tx.userMiner.findFirst({
        where: { userId, slotIndex, id: { not: excludeMachineId } },
        include: rackMinerInclude,
    });
}
export async function clearRackReferencesTx(tx, userMinerId) {
    await tx.userRack.updateMany({
        where: { userMinerId },
        data: { userMinerId: null, installedAt: null },
    });
    await tx.userRack.updateMany({
        where: { blockedByMinerId: userMinerId },
        data: { blockedByMinerId: null },
    });
}
/**
 * Ensures a `UserOwnedMachine` row exists for a rack (`UserMiner`) row, creating one
 * on first move to inventory (Option B canonical-row pattern, ported from
 * userOwnedMachineService.ensureOwnedMachineForUserMinerTx).
 */
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
export async function createUserInventoryEntryTx(tx, data) {
    await tx.userInventory.create({ data });
}
export async function syncOwnedMachineLocationTx(tx, ownedMachineId, location, snapshot) {
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
/**
 * Mints a NEW inventory row + NEW owned-machine (shop/faucet/rewards).
 * Do NOT use for rack displacement — that must call ensureOwnedMachine + sync
 * via displaceRackMinerToInventoryTx in machines.service.ts to avoid orphan OMs.
 */
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
            ownedMachineId: om.id,
        },
    });
    return om.id;
}
