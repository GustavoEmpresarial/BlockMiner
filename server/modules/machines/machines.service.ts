// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/machines/application/machines.service.ts.
 *
 * FIX (item 88): legacy calls `applyEngineSideEffects()` after every rack mutation
 * (`syncUserBaseHashRate` + `miningEngine.reloadMinerProfile`) to keep the in-memory
 * mining engine's hashrate in sync. That hook used to be a documented TODO here, on the
 * grounds that machines/ must not import mining/ internals — but that blocker is stale:
 * `mining/index.ts` is the module's PUBLIC surface and already exports
 * `miningEngine.reloadMinerProfile`, and rooms/rooms.service.ts has called it across
 * this exact boundary since item 45. Leaving it unwired was a real, active earnings bug:
 * the engine caches `baseHashRate` per user and `getOrCreateEngineMinerForUser()`
 * short-circuits on an already-cached miner, so toggling a machine off left it mining
 * (over-earning), and toggling one on / moving it did nothing until a server restart.
 * Same bug class as items 45 and 74.
 */
import prisma from "../../core/database/prisma.js";
import * as machinesRepo from "./machines.repository.js";
import { MachineNotFoundError, InvalidSlotError } from "./machines.errors.js";
import { computeTargetSlots, isValidSlotForSize } from "./machines.types.js";
import { resolveOwnedMachineDisplay } from "./ownedMachineDisplay.js";
import { miningEngine } from "../mining/index.js";
/**
 * Best-effort engine resync after a rack mutation — the DB write already committed, so a
 * failure here must never surface as a request error (same doctrine as rooms.service.ts).
 */
async function resyncEngine(userId) {
    try {
        await miningEngine.reloadMinerProfile(userId);
    }
    catch {
        /* engine cache resync is best-effort — DB is already the source of truth */
    }
}
export async function toggleMachineForUser(userId, machineId, isActive) {
    const machine = await machinesRepo.findMachineById(userId, machineId);
    if (!machine)
        throw new MachineNotFoundError();
    await prisma.$transaction(async (tx) => {
        await machinesRepo.updateMachineActiveTx(tx, userId, machineId, isActive);
    });
    await resyncEngine(userId);
}
export async function removeMachineToInventory(userId, machineId, now = new Date()) {
    const fullMiner = await machinesRepo.findFullMinerWithMinerInfo(userId, machineId);
    if (!fullMiner)
        throw new MachineNotFoundError("Miner not found.");
    await prisma.$transaction(async (tx) => {
        await displaceRackMinerToInventoryTx(tx, fullMiner, now);
    });
    await resyncEngine(userId);
}
/**
 * Fallback seguro rack → inventário: reusa o `UserOwnedMachine` canônico (não cria
 * outro nem deixa órfão). Usado por remove, displace em move de slot, vault→rack
 * quando o destino já está ocupado, e inventory install overlap.
 */
export async function displaceRackMinerToInventoryTx(tx, m, now) {
    await machinesRepo.clearRackReferencesTx(tx, m.id);
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
    const omId = await machinesRepo.ensureOwnedMachineForUserMinerTx(tx, {
        id: m.id,
        userId: m.userId,
        ownedMachineId: m.ownedMachineId,
        minerId: m.minerId,
        level: m.level,
        hashRate: m.hashRate,
        slotSize: m.slotSize,
        imageUrl: display.imageUrl,
    }, display.minerName);
    await machinesRepo.createUserInventoryEntryTx(tx, {
        userId: m.userId,
        minerName: display.minerName,
        level: m.level,
        hashRate: m.hashRate,
        slotSize: m.slotSize,
        minerId: m.minerId ?? null,
        imageUrl: display.imageUrl,
        acquiredAt: now,
        ownedMachineId: omId,
    });
    await machinesRepo.syncOwnedMachineLocationTx(tx, omId, "INVENTORY", {
        minerId: m.minerId,
        minerName: display.minerName,
        level: m.level,
        hashRate: m.hashRate,
        slotSize: m.slotSize ?? 1,
        imageUrl: display.imageUrl,
    });
    await machinesRepo.deleteUserMinerTx(tx, m.id);
}
export async function moveMachineForUser(userId, machineId, targetSlotIndex, slotSize) {
    const targetSlots = computeTargetSlots(targetSlotIndex, slotSize);
    const existingMachines = await machinesRepo.findOverlappingMachines(userId, targetSlots, machineId);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
        // 1. Send existing overlapping machines to inventory (preserve ownedMachineId).
        for (const m of existingMachines) {
            await displaceRackMinerToInventoryTx(tx, m, now);
        }
        // 2. Check for 2-slot overlaps from the previous slot (odd target under a size-2 machine).
        if (targetSlotIndex % 2 === 1) {
            const prevMachine = await machinesRepo.findPrevSlotMachineTx(tx, userId, targetSlotIndex - 1, machineId);
            if (prevMachine && prevMachine.slotSize === 2) {
                await displaceRackMinerToInventoryTx(tx, prevMachine, now);
            }
        }
        // 3. Move the actual machine.
        await machinesRepo.updateMachineSlotIndexTx(tx, machineId, targetSlotIndex);
    });
    // Um move pode DESLOCAR outras máquinas pro inventário (passos 1 e 2), então o total
    // do rack muda mesmo quando "só" se moveu uma peça de lugar.
    await resyncEngine(userId);
}
export async function listMachinesForUser(userId) {
    return machinesRepo.listUserMachines(userId);
}
/** Pre-tx-safe read of a rack machine + its miner catalog row, scoped to a caller's own tx. */
export async function findRackMinerForUserTx(tx, userId, machineId) {
    return machinesRepo.findFullMinerWithMinerInfoTx(tx, userId, machineId);
}
/** Detaches a rack (`UserMiner`) row from its `UserRack` slot bookkeeping — first step of moving it out of the rack. */
export async function releaseRackReferencesTx(tx, userMinerId) {
    await machinesRepo.clearRackReferencesTx(tx, userMinerId);
}
/** Ensures the canonical `UserOwnedMachine` row exists for a rack machine before it leaves the rack (Option B pattern). */
export async function ensureOwnedMachineForRackMinerTx(tx, m, displayName) {
    return machinesRepo.ensureOwnedMachineForUserMinerTx(tx, m, displayName);
}
/** Syncs the canonical owned-machine snapshot/location after a move (mirrors machines.repository.syncOwnedMachineLocationTx). */
export async function syncOwnedMachineLocationForVaultTx(tx, ownedMachineId, location, snapshot) {
    await machinesRepo.syncOwnedMachineLocationTx(tx, ownedMachineId, location, snapshot);
}
/** Deletes the rack (`UserMiner`) row once its data has been persisted elsewhere (vault). */
export async function deleteRackMinerTx(tx, machineId) {
    await machinesRepo.deleteUserMinerTx(tx, machineId);
}
/**
 * Places a vault item back into a rack slot, displacing any machine(s) already
 * occupying the target slot(s) into inventory first — same safe fallback as
 * `moveMachineForUser` (reuses ownedMachineId; no orphan OM). Returns the new rack row id.
 */
export async function placeIntoRackSlotTx(tx, userId, targetSlotIndex, slotSize, data, now = new Date()) {
    if (!isValidSlotForSize(targetSlotIndex, slotSize)) {
        throw new InvalidSlotError();
    }
    const targetSlots = computeTargetSlots(targetSlotIndex, slotSize);
    const existingMachines = await machinesRepo.findOverlappingMachinesTx(tx, userId, targetSlots);
    for (const m of existingMachines) {
        await displaceRackMinerToInventoryTx(tx, m, now);
    }
    // Odd target under a size-2 machine starting on the previous even slot.
    if (targetSlotIndex % 2 === 1) {
        const prevMachine = await machinesRepo.findPrevSlotMachineTx(tx, userId, targetSlotIndex - 1, -1);
        if (prevMachine && prevMachine.slotSize === 2) {
            await displaceRackMinerToInventoryTx(tx, prevMachine, now);
        }
    }
    return machinesRepo.createUserMinerAtSlotTx(tx, {
        userId,
        slotIndex: targetSlotIndex,
        level: data.level,
        hashRate: data.hashRate,
        isActive: true,
        slotSize,
        minerId: data.minerId,
        imageUrl: data.imageUrl,
        ownedMachineId: data.ownedMachineId,
    });
}
