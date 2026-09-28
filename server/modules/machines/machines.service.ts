/**
 * Ported from legacy/server/modules/machines/application/machines.service.ts.
 *
 * FIX (item 88): legacy calls `applyEngineSideEffects()` after every rack mutation
 * (`syncUserBaseHashRate` + `miningEngine.reloadMinerProfile`) to keep the in-memory
 * mining engine's hashrate in sync.
 */
import type { Prisma } from "@prisma/client";
import prisma, { type TxClient } from "../../core/database/prisma.js";
import * as machinesRepo from "./machines.repository.js";
import { MachineNotFoundError, InvalidSlotError } from "./machines.errors.js";
import { computeTargetSlots, isValidSlotForSize } from "./machines.types.js";
import { resolveOwnedMachineDisplay } from "./ownedMachineDisplay.js";
import { miningEngine } from "../mining/index.js";

type AppPrismaTx = TxClient;

export type RackMinerForVault = machinesRepo.RackMinerDbRow;

export interface PlaceIntoRackSlotInput {
  level?: number | null;
  hashRate?: number | null;
  minerId?: number | null;
  imageUrl?: string | null;
  ownedMachineId?: number | null;
}

/**
 * Best-effort engine resync after a rack mutation — the DB write already committed, so a
 * failure here must never surface as a request error (same doctrine as rooms.service.ts).
 */
async function resyncEngine(userId: number): Promise<void> {
  try {
    await miningEngine.reloadMinerProfile(userId);
  } catch {
    /* engine cache resync is best-effort — DB is already the source of truth */
  }
}

export async function toggleMachineForUser(userId: number, machineId: number, isActive: boolean): Promise<void> {
  const machine = await machinesRepo.findMachineById(userId, machineId);
  if (!machine) throw new MachineNotFoundError();
  await prisma.$transaction(async (tx) => {
    await machinesRepo.updateMachineActiveTx(tx, userId, machineId, isActive);
  });
  await resyncEngine(userId);
}

export async function removeMachineToInventory(userId: number, machineId: number, now = new Date()): Promise<void> {
  const fullMiner = await machinesRepo.findFullMinerWithMinerInfo(userId, machineId);
  if (!fullMiner) throw new MachineNotFoundError("Miner not found.");
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
export async function displaceRackMinerToInventoryTx(
  tx: AppPrismaTx,
  m: {
    id: number;
    userId: number;
    minerId: number | null;
    ownedMachineId: number | null;
    imageUrl?: string | null;
    level?: number | null;
    hashRate?: number | null;
    slotSize?: number | null;
    miner?: { name: string; imageUrl: string | null } | null;
    ownedMachine?: {
      minerName: string | null;
      imageUrl: string | null;
      eventMiner?: { name: string; imageUrl: string | null } | null;
    } | null;
  },
  now: Date,
): Promise<void> {
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
  const omId = await machinesRepo.ensureOwnedMachineForUserMinerTx(
    tx,
    {
      id: m.id,
      userId: m.userId,
      ownedMachineId: m.ownedMachineId,
      minerId: m.minerId,
      level: m.level,
      hashRate: m.hashRate,
      slotSize: m.slotSize,
      imageUrl: display.imageUrl,
    },
    display.minerName,
  );
  await machinesRepo.createUserInventoryEntryTx(tx, {
    userId: m.userId,
    minerName: display.minerName,
    level: m.level ?? 1,
    hashRate: m.hashRate ?? 0,
    slotSize: m.slotSize ?? 1,
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

export async function moveMachineForUser(
  userId: number,
  machineId: number,
  targetSlotIndex: number,
  slotSize: number,
): Promise<void> {
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
  await resyncEngine(userId);
}

export async function listMachinesForUser(userId: number): Promise<machinesRepo.RackMinerDisplayRow[]> {
  return machinesRepo.listUserMachines(userId);
}

/** Pre-tx-safe read of a rack machine + its miner catalog row, scoped to a caller's own tx. */
export async function findRackMinerForUserTx(
  tx: AppPrismaTx,
  userId: number,
  machineId: number,
): Promise<machinesRepo.RackMinerDbRow | null> {
  return machinesRepo.findFullMinerWithMinerInfoTx(tx, userId, machineId);
}

/** Detaches a rack (`UserMiner`) row from its `UserRack` slot bookkeeping — first step of moving it out of the rack. */
export async function releaseRackReferencesTx(tx: AppPrismaTx, userMinerId: number): Promise<void> {
  await machinesRepo.clearRackReferencesTx(tx, userMinerId);
}

/** Ensures the canonical `UserOwnedMachine` row exists for a rack machine before it leaves the rack (Option B pattern). */
export async function ensureOwnedMachineForRackMinerTx(
  tx: AppPrismaTx,
  m: {
    id: number;
    userId: number;
    minerId: number | null;
    ownedMachineId: number | null;
    level?: number | null;
    hashRate?: number | null;
    slotSize?: number | null;
    imageUrl?: string | null;
  },
  displayName: string,
): Promise<number> {
  return machinesRepo.ensureOwnedMachineForUserMinerTx(tx, m, displayName);
}

/** Syncs the canonical owned-machine snapshot/location after a move (mirrors machines.repository.syncOwnedMachineLocationTx). */
export async function syncOwnedMachineLocationForVaultTx(
  tx: AppPrismaTx,
  ownedMachineId: number,
  location: "RACK" | "INVENTORY" | "WAREHOUSE",
  snapshot: machinesRepo.MachineSnapshot,
): Promise<void> {
  await machinesRepo.syncOwnedMachineLocationTx(tx, ownedMachineId, location, snapshot);
}

/** Deletes the rack (`UserMiner`) row once its data has been persisted elsewhere (vault). */
export async function deleteRackMinerTx(tx: AppPrismaTx, machineId: number): Promise<void> {
  await machinesRepo.deleteUserMinerTx(tx, machineId);
}

/**
 * Places a vault item back into a rack slot, displacing any machine(s) already
 * occupying the target slot(s) into inventory first — same safe fallback as
 * `moveMachineForUser` (reuses ownedMachineId; no orphan OM). Returns the new rack row id.
 */
export async function placeIntoRackSlotTx(
  tx: AppPrismaTx,
  userId: number,
  targetSlotIndex: number,
  slotSize: number,
  data: PlaceIntoRackSlotInput,
  now = new Date(),
) {
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
    level: data.level ?? 1,
    hashRate: data.hashRate ?? 0,
    isActive: true,
    slotSize,
    minerId: data.minerId ?? null,
    imageUrl: data.imageUrl ?? null,
    ownedMachineId: data.ownedMachineId ?? null,
  });
}
