/**
 * Ported from legacy/server/modules/inventory/infrastructure/repositories/inventory.repository.ts.
 *
 * Trimmed to what the live paths need: listing a user's backpack, and creating
 * inventory+owned-machine rows on grant (shop purchase, rewards, register bonus,
 * etc. via inventory.service.ts's `grantPurchasedInventoryItems`). The
 * install/remove-specific helpers that used to live here were removed alongside
 * the dead POST /inventory/install|remove routes — see inventory.routes.ts header.
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
