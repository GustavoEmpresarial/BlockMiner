import type { Prisma } from "@prisma/client";
import prisma, { type TxClient } from "../../core/database/prisma.js";
import { resolveGrantEventMinerId } from "./eventMinerDisplayName.js";
import { ownedMachineDisplaySelect, resolveOwnedMachineDisplay } from "./ownedMachineDisplay.js";

type AppPrismaTx = TxClient;

const rackMinerInclude = {
  miner: { select: { name: true, imageUrl: true } },
  ownedMachine: { select: ownedMachineDisplaySelect },
} as const;

export type RackMinerDbRow = Prisma.UserMinerGetPayload<{
  include: typeof rackMinerInclude;
}>;

export interface RackMinerDisplayRow extends RackMinerDbRow {
  miner_name: string;
  image_url: string | null;
}

function mapRackMinerDisplay(m: RackMinerDbRow): RackMinerDisplayRow {
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

export async function listUserMachines(userId: number): Promise<RackMinerDisplayRow[]> {
  const machines = await prisma.userMiner.findMany({
    where: { userId },
    include: rackMinerInclude,
    orderBy: { slotIndex: "asc" },
  });
  return machines.map((m) => mapRackMinerDisplay(m));
}

export async function findMachineById(userId: number, machineId: number): Promise<RackMinerDisplayRow | null> {
  const m = await prisma.userMiner.findFirst({
    where: { id: machineId, userId },
    include: rackMinerInclude,
  });
  if (!m) return null;
  return mapRackMinerDisplay(m);
}

/** Pre-transaction read: full row + miner relation (legacy `findFullMinerWithMinerInfo`). */
export async function findFullMinerWithMinerInfo(userId: number, machineId: number): Promise<RackMinerDbRow | null> {
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
export async function findFullMinerWithMinerInfoTx(
  tx: AppPrismaTx,
  userId: number,
  machineId: number,
): Promise<RackMinerDbRow | null> {
  return tx.userMiner.findFirst({
    where: { id: machineId, userId },
    include: rackMinerInclude,
  });
}

/** Tx-scoped variant of findOverlappingMachines, without the excludeMachineId filter (used when creating a brand-new rack row from the vault, so there is no "self" to exclude). */
export async function findOverlappingMachinesTx(
  tx: AppPrismaTx,
  userId: number,
  targetSlots: number[],
): Promise<RackMinerDbRow[]> {
  return tx.userMiner.findMany({
    where: { userId, slotIndex: { in: targetSlots } },
    include: rackMinerInclude,
  });
}

/** Creates a brand-new rack (`UserMiner`) row at a specific slot — the inverse of deleteUserMinerTx, used when retrieving a vault item straight into a rack slot. */
export async function createUserMinerAtSlotTx(
  tx: AppPrismaTx,
  data: Prisma.UserMinerUncheckedCreateInput,
) {
  return tx.userMiner.create({ data });
}

export async function findOverlappingMachines(
  userId: number,
  targetSlots: number[],
  excludeMachineId?: number,
): Promise<RackMinerDbRow[]> {
  return prisma.userMiner.findMany({
    where: {
      userId,
      slotIndex: { in: targetSlots },
      ...(excludeMachineId != null ? { id: { not: excludeMachineId } } : {}),
    },
    include: rackMinerInclude,
  });
}

/** All `Tx` functions below run inside the caller's `prisma.$transaction`. */
export async function updateMachineActiveTx(
  tx: AppPrismaTx,
  userId: number,
  machineId: number,
  isActive: boolean,
): Promise<void> {
  await tx.userMiner.update({ where: { id: machineId, userId }, data: { isActive } });
}

export async function deleteUserMinerTx(tx: AppPrismaTx, machineId: number): Promise<void> {
  await tx.userMiner.delete({ where: { id: machineId } });
}

export async function updateMachineSlotIndexTx(
  tx: AppPrismaTx,
  machineId: number,
  targetSlotIndex: number,
): Promise<void> {
  await tx.userMiner.update({ where: { id: machineId }, data: { slotIndex: targetSlotIndex } });
}

export async function findPrevSlotMachineTx(
  tx: AppPrismaTx,
  userId: number,
  slotIndex: number,
  excludeMachineId: number,
): Promise<RackMinerDbRow | null> {
  return tx.userMiner.findFirst({
    where: { userId, slotIndex, id: { not: excludeMachineId } },
    include: rackMinerInclude,
  });
}

export async function clearRackReferencesTx(tx: AppPrismaTx, userMinerId: number): Promise<void> {
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
export async function ensureOwnedMachineForUserMinerTx(
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
  minerDisplayName: string,
): Promise<number> {
  if (m.ownedMachineId != null) return m.ownedMachineId;
  const eventMinerId = await resolveGrantEventMinerId(
    tx,
    { minerId: m.minerId, minerName: minerDisplayName },
    { strict: false },
  );
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

export async function createUserInventoryEntryTx(
  tx: AppPrismaTx,
  data: Prisma.UserInventoryUncheckedCreateInput,
): Promise<void> {
  await tx.userInventory.create({ data });
}

export interface MachineSnapshot {
  minerId?: number | null;
  minerName: string;
  level?: number | null;
  hashRate?: number | null;
  slotSize?: number | null;
  imageUrl?: string | null;
}

export async function syncOwnedMachineLocationTx(
  tx: AppPrismaTx,
  ownedMachineId: number,
  location: "RACK" | "INVENTORY" | "WAREHOUSE",
  snapshot: MachineSnapshot,
): Promise<void> {
  await tx.userOwnedMachine.update({
    where: { id: ownedMachineId },
    data: {
      location,
      minerId: snapshot.minerId,
      minerName: snapshot.minerName,
      level: snapshot.level ?? 1,
      hashRate: snapshot.hashRate ?? 0,
      slotSize: snapshot.slotSize ?? 1,
      imageUrl: snapshot.imageUrl,
    },
  });
}

export interface CreateInventoryWithOwnedMachinePayload {
  userId: number;
  minerId?: number | null;
  minerName: string;
  level?: number | null;
  hashRate?: number | null;
  slotSize?: number | null;
  imageUrl?: string | null;
  acquiredAt?: Date;
}

/**
 * Mints a NEW inventory row + NEW owned-machine (shop/faucet/rewards).
 * Do NOT use for rack displacement — that must call ensureOwnedMachine + sync
 * via displaceRackMinerToInventoryTx in machines.service.ts to avoid orphan OMs.
 */
export async function createInventoryWithOwnedMachineTx(
  tx: AppPrismaTx,
  payload: CreateInventoryWithOwnedMachinePayload,
): Promise<number> {
  const eventMinerId = await resolveGrantEventMinerId(
    tx,
    { minerId: payload.minerId ?? null, minerName: payload.minerName },
    { strict: false },
  );
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
      level: payload.level ?? 1,
      hashRate: payload.hashRate ?? 0,
      slotSize: payload.slotSize ?? 1,
      imageUrl: payload.imageUrl,
      acquiredAt: payload.acquiredAt,
      ownedMachineId: om.id,
    },
  });
  return om.id;
}
