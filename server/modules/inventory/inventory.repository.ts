/**
 * Ported from legacy/server/modules/inventory/infrastructure/repositories/inventory.repository.ts
 * + legacy/server/services/userOwnedMachineService.ts (ensure/sync/create owned-machine helpers,
 * trimmed to what inventory needs) + legacy/server/utils/rackMinerRelease.ts.
 *
 * Deviation (documented, matches modules/machines/machines.repository.ts): legacy wraps mutations
 * with `advisoryXactTryLockOrThrow` + `lockUserRowForUpdate` (Postgres advisory + row locks) before
 * the `$transaction`. That lock infra has not been ported into current/server/core yet, so this
 * repository relies on Prisma's transaction + unique constraints to prevent corruption. Re-add the
 * advisory lock wrapper here once it lands in core/database, matching legacy exactly.
 */
import type { TxClient } from "../../core/database/prisma.js";
import prisma from "../../core/database/prisma.js";
import { resolveGrantEventMinerId } from "../machines/eventMinerDisplayName.js";

export async function listInventory(userId: number) {
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

export async function findInventoryItemWithRelationsTx(tx: TxClient, userId: number, inventoryId: number) {
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

export async function findInventoryItemBasicTx(tx: TxClient, userId: number, inventoryId: number) {
  return tx.userInventory.findFirst({
    where: { id: inventoryId, userId },
    select: { id: true, ownedMachineId: true },
  });
}

export async function deleteInventoryItemTx(tx: TxClient, userId: number, inventoryId: number): Promise<void> {
  await tx.userInventory.delete({ where: { id: inventoryId, userId } });
}

export async function deleteOwnedMachineTx(tx: TxClient, ownedMachineId: number): Promise<void> {
  await tx.userOwnedMachine.delete({ where: { id: ownedMachineId } });
}

export async function findOverlappingUserMinersTx(tx: TxClient, userId: number, targetSlots: number[]) {
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

export async function findPrevSlotMachineTx(tx: TxClient, userId: number, slotIndex: number) {
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

export async function deleteUserMinerTx(tx: TxClient, id: number): Promise<void> {
  await tx.userMiner.delete({ where: { id } });
}

/** Ported from legacy utils/rackMinerRelease.ts `releaseUserMinerFromRacksTx` (also duplicated in machines.repository.ts as `clearRackReferencesTx`). */
export async function releaseUserMinerFromRacksTx(tx: TxClient, userMinerId: number): Promise<void> {
  await tx.userRack.updateMany({
    where: { userMinerId },
    data: { userMinerId: null, installedAt: null },
  });
  await tx.userRack.updateMany({
    where: { blockedByMinerId: userMinerId },
    data: { blockedByMinerId: null },
  });
}

export type CreateUserMinerFromInventoryTxInput = {
  userId: number;
  slotIndex: number;
  level: number;
  hashRate: number;
  isActive: boolean;
  slotSize: number;
  minerId: number | null;
  imageUrl: string | null;
  ownedMachineId: number;
};

export async function createUserMinerFromInventoryTx(tx: TxClient, data: CreateUserMinerFromInventoryTxInput): Promise<void> {
  await tx.userMiner.create({ data });
}

/**
 * Ensures a `UserOwnedMachine` row exists for an inventory row, creating one on first
 * install (Option B canonical-row pattern, ported from
 * userOwnedMachineService.ensureOwnedMachineForInventoryTx).
 */
export async function ensureOwnedMachineForInventoryTx(
  tx: TxClient,
  row: {
    id: number;
    userId: number;
    ownedMachineId: number | null;
    minerId: number | null;
    minerName: string;
    level: number;
    hashRate: number;
    slotSize: number;
    imageUrl: string | null;
  },
): Promise<number> {
  if (row.ownedMachineId != null) return row.ownedMachineId;
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

export async function syncOwnedMachineSnapshotTx(
  tx: TxClient,
  ownedMachineId: number,
  location: "INVENTORY" | "RACK" | "WAREHOUSE",
  snapshot: {
    minerId: number | null;
    minerName: string;
    level: number;
    hashRate: number;
    slotSize: number;
    imageUrl: string | null;
  },
): Promise<void> {
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
export async function createInventoryWithOwnedMachineTx(
  tx: TxClient,
  payload: {
    userId: number;
    minerName: string;
    level: number;
    hashRate: number;
    slotSize: number;
    minerId: number | null;
    imageUrl: string | null;
    acquiredAt: Date;
    updatedAt: Date;
    snapshotSlug?: string | null;
    snapshotPrice?: number | null;
    acquisitionSource?: string | null;
    expiresAt?: Date | null;
    eventMinerId?: number | null;
  },
): Promise<number> {
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
export async function bulkCreateInventoryWithOwnedMachinesTx(
  tx: TxClient,
  userId: number,
  template: {
    minerId: number | null;
    eventMinerId?: number | null;
    minerName: string;
    level?: number;
    hashRate: number;
    slotSize?: number;
    imageUrl: string | null;
    snapshotSlug?: string | null;
    snapshotPrice?: number | null;
    acquisitionSource?: string | null;
  },
  quantity: number,
  now: Date,
): Promise<void> {
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
