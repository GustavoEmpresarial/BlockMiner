/**
 * Ported from legacy/server/modules/rooms/application/rooms.service.ts.
 *
 * Deviations (documented, same as shop/inventory/shortlinks):
 * - advisoryXactTryLockOrThrow not ported — relies on Prisma transaction isolation.
 * - applyUserBalanceDelta skipped (this module never mutates balance).
 * - createNotification from notifications/ persists DB only (no Socket.IO).
 *
 * FIX (11/08/2026, PROGRESSO.txt item 45): install/uninstall used to call
 * `syncUserBaseHashRate(userId)` and discard its return value — that function only
 * *recomputes* the DB-derived hashrate, it never writes it back into the in-memory mining
 * engine. Since getOrCreateEngineMinerForUser() short-circuits on an existing cached miner
 * (never re-reads the DB once created), the dashboard's "Sua Velocidade" stayed frozen at
 * whatever it was when the engine first loaded that user — installing/uninstalling a machine
 * had zero visible effect until the whole server restarted. Same bug class as the shop
 * purchase balance fix (item 43): now calls miningEngine.reloadMinerProfile(userId) so the
 * engine's cached baseHashRate mirrors the DB immediately after every install/uninstall.
 */
import prisma from "../../core/database/prisma.js";
import { HttpStatusError } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { miningEngine } from "../mining/index.js";
import { createNotification } from "../notifications/index.js";
import { getRoomPriceQuote } from "./rooms.config.js";
import { buildListedRoomsPayload, countRackTotals } from "./rooms.dto.js";
import {
  isRackSlotOccupied,
  isRowEdgeViolation,
  isTwoSlotSpillFromPrevious,
  rackSlotIndex,
} from "./rooms.placement.js";
import { resolveOwnedMachineDisplay } from "../machines/ownedMachineDisplay.js";
import * as roomsRepo from "./rooms.repository.js";
import { RACKS_PER_ROOM, ROOM_MAX, starterRackSlotCount, type MinerWithMinerRel, type RackMoveBackRow } from "./rooms.types.js";

const log = logger.child("rooms.service");

async function moveRackMinerBackToInventoryTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  rack: RackMoveBackRow,
  miner: MinerWithMinerRel,
  acquiredAt: Date,
): Promise<{ minerName: string }> {
  const display = resolveOwnedMachineDisplay({
    minerId: miner.minerId,
    rowImageUrl: miner.imageUrl,
    catalogName: miner.miner?.name,
    catalogImageUrl: miner.miner?.imageUrl,
    ownedName: miner.ownedMachine?.minerName,
    ownedImageUrl: miner.ownedMachine?.imageUrl,
    eventName: miner.ownedMachine?.eventMiner?.name,
    eventImageUrl: miner.ownedMachine?.eventMiner?.imageUrl,
  });
  const minerName = display.minerName;
  const imageUrl = display.imageUrl;

  await roomsRepo.clearRackInstallationTx(tx, rack.id);
  await roomsRepo.clearBlockedByMinerTx(tx, rack.roomId, miner.id);

  const omId = await roomsRepo.ensureOwnedMachineForUserMinerTx(tx, miner, minerName);
  await roomsRepo.createInventoryRowFromRackTx(tx, {
    userId: rack.userId,
    minerId: miner.minerId,
    minerName,
    level: miner.level,
    hashRate: miner.hashRate,
    slotSize: miner.slotSize,
    imageUrl,
    acquiredAt,
    ownedMachineId: omId,
  });
  await roomsRepo.syncOwnedMachineSnapshotTx(tx, omId, "INVENTORY", {
    minerId: miner.minerId,
    minerName,
    level: miner.level,
    hashRate: miner.hashRate,
    slotSize: miner.slotSize ?? 1,
    imageUrl,
  });

  await roomsRepo.deleteUserMinerTx(tx, miner.id);
  return { minerName };
}

/**
 * Provisions the free starter room (room 1, price 0) with a single visual rack
 * (8 machine slots by default — {@link starterRackSlotCount}) for a brand-new user.
 * Meant to be called from within the SAME Prisma transaction that creates the user
 * row (e.g. auth/register), so a user is never left half-provisioned.
 * Extra racks come from the shop / placing more visual racks later.
 */
export async function provisionFirstRoomTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: number,
): Promise<{ roomId: number }> {
  const room = await roomsRepo.createUserRoomTx(tx, {
    userId,
    roomNumber: 1,
    pricePaid: 0,
  });
  const starterSlots = starterRackSlotCount();
  const racksData = Array.from({ length: starterSlots }, (_, i) => ({
    userId,
    roomId: room.id,
    position: i,
  }));
  await roomsRepo.createRacksBatchTx(tx, racksData);
  return { roomId: room.id };
}

export async function listRoomsForUser(userId: number) {
  const now = new Date();
  const rooms = await roomsRepo.findRoomsWithRacksForUser(userId);
  const result = buildListedRoomsPayload(rooms, undefined, now);
  const { totalRacks, occupiedRacks, freeRacks } = countRackTotals(rooms);
  return { ok: true as const, rooms: result, totalRacks, occupiedRacks, freeRacks };
}

export async function countUnlockedRoomsForUser(userId: number): Promise<number> {
  const existing = await roomsRepo.findUserRoomsOrdered(userId);
  return existing.length;
}

export type BuyRoomResult =
  | { ok: true; roomNumber: number; roomId: number; message: string }
  | { ok: false; status: number; code?: string; message: string };

export async function buyRoomForUser(userId: number): Promise<BuyRoomResult> {
  log.info("buyRoom attempt", { userId });
  const existing = await roomsRepo.findUserRoomsOrdered(userId);
  const nextRoom = existing.length + 1;

  if (nextRoom > ROOM_MAX) {
    return {
      ok: false,
      status: 400,
      code: "MAX_ROOMS_REACHED",
      message: "Você já desbloqueou todas as salas disponíveis.",
    };
  }

  const price = getRoomPriceQuote(nextRoom).price;
  if (typeof price !== "number" || isNaN(price) || price < 0) {
    return { ok: false, status: 500, message: "Configuração de preço inválida." };
  }

  let newRoom;
  try {
    newRoom = await prisma.$transaction(async (tx) => {
      // Same pattern as shop's executeMinerPurchaseTransaction (item 86/93): serializes
      // concurrent unlock requests for the same user before any balance read, so a
      // double-click/network retry can't both pass the balance check and go negative.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, ${nextRoom}::int)`;

      const balanceUser = await roomsRepo.findUserBlkBalanceTx(tx, userId);
      if (!balanceUser) {
        throw new HttpStatusError(404, "Usuário não encontrado.");
      }
      if (Number(balanceUser.blkBalance) < price) {
        throw new HttpStatusError(400, "Saldo BLK insuficiente para desbloquear esta sala.", {
          code: "INSUFFICIENT_BALANCE",
        });
      }

      if (price > 0) {
        await roomsRepo.decrementUserBalanceTx(tx, userId, price);
      }
      const room = await roomsRepo.createUserRoomTx(tx, {
        userId,
        roomNumber: nextRoom,
        pricePaid: price,
      });
      const racksData = Array.from({ length: RACKS_PER_ROOM }, (_, i) => ({
        userId,
        roomId: room.id,
        position: i,
      }));
      await roomsRepo.createRacksBatchTx(tx, racksData);
      return room;
    });
  } catch (err) {
    if (err instanceof HttpStatusError) {
      return { ok: false, status: err.http, code: err.code, message: err.message };
    }
    throw err;
  }

  await createNotification({
    userId,
    title: "Sala Desbloqueada!",
    message: `Sala ${nextRoom} desbloqueada com sucesso! ${RACKS_PER_ROOM} racks disponíveis.`,
    type: "success",
  });

  return {
    ok: true,
    roomNumber: nextRoom,
    roomId: newRoom.id,
    message: `Sala ${nextRoom} desbloqueada com sucesso!`,
  };
}

export type InstallMinerFailure = {
  status: number;
  code?: string;
  message: string;
};

type InstallMinerContext = {
  rack: NonNullable<Awaited<ReturnType<typeof roomsRepo.findRackWithRoomForUser>>>;
  inventoryItem: NonNullable<Awaited<ReturnType<typeof roomsRepo.findInventoryItemForUser>>>;
  adjacentRack: Awaited<ReturnType<typeof roomsRepo.findRackByRoomAndPosition>>;
  slotIndex: number;
};

async function resolveInstallMinerContext(
  userId: number,
  rackId: number,
  inventoryId: number,
): Promise<InstallMinerFailure | InstallMinerContext> {
  const rack = await roomsRepo.findRackWithRoomForUser(rackId, userId);
  if (!rack) return { status: 404, message: "Rack não encontrado." };
  if (isRackSlotOccupied(rack)) {
    return { status: 400, code: "RACK_OCCUPIED", message: "Este rack já está ocupado." };
  }

  if (rack.position > 0) {
    const prevRack = await roomsRepo.findRackByRoomAndPosition(rack.roomId, rack.position - 1);
    if (prevRack?.userMinerId != null) {
      const prevMinerRow = await roomsRepo.findUserMinerSlotSize(prevRack.userMinerId);
      if (isTwoSlotSpillFromPrevious(prevMinerRow?.slotSize)) {
        return { status: 400, code: "RACK_OCCUPIED", message: "Este rack já está ocupado." };
      }
    }
  }

  const inventoryItem = await roomsRepo.findInventoryItemForUser(inventoryId, userId);
  if (!inventoryItem) return { status: 404, message: "Item não encontrado no inventário." };

  const slotSize = inventoryItem.slotSize || 1;
  let adjacentRack: Awaited<ReturnType<typeof roomsRepo.findRackByRoomAndPosition>> = null;
  if (slotSize >= 2) {
    if (isRowEdgeViolation(rack.position, slotSize)) {
      return {
        status: 400,
        code: "ROW_EDGE_NO_SPACE",
        message: "Máquinas de 2 slots precisam começar antes do fim da linha do rack.",
      };
    }
    adjacentRack = await roomsRepo.findRackByRoomAndPosition(rack.roomId, rack.position + (slotSize - 1));
    if (!adjacentRack) {
      return {
        status: 400,
        code: "NO_SPACE",
        message: "Não há espaço suficiente para esta máquina de 2 slots. Escolha um rack anterior.",
      };
    }
    if (isRackSlotOccupied(adjacentRack)) {
      return {
        status: 400,
        code: "ADJACENT_RACK_OCCUPIED",
        message: "O rack adjacente está ocupado. Escolha outro rack para esta máquina de 2 slots.",
      };
    }
  }

  return {
    rack,
    inventoryItem,
    adjacentRack,
    slotIndex: rackSlotIndex(rack.room.roomNumber, rack.position),
  };
}

export async function preflightInstallMiner(
  userId: number,
  rackId: number,
  inventoryId: number,
): Promise<InstallMinerFailure | null> {
  const resolved = await resolveInstallMinerContext(userId, rackId, inventoryId);
  return "status" in resolved ? resolved : null;
}

export type UninstallMinerFailure = {
  status: number;
  code?: string;
  message: string;
};

export async function preflightUninstallMiner(
  userId: number,
  rackId: number,
): Promise<UninstallMinerFailure | null> {
  const rack = await roomsRepo.findRackWithMinerForUser(rackId, userId);
  if (!rack) return { status: 404, message: "Rack não encontrado." };
  if (!rack.userMiner) {
    return { status: 400, code: "RACK_EMPTY", message: "Este rack não tem máquina instalada." };
  }
  return null;
}

export async function installMinerForUser(
  userId: number,
  rackId: number,
  inventoryId: number,
): Promise<{ inventoryItem: { minerName: string } } | InstallMinerFailure> {
  const resolved = await resolveInstallMinerContext(userId, rackId, inventoryId);
  if ("status" in resolved) return resolved;
  const { inventoryItem, adjacentRack, slotIndex } = resolved;
  const slotSize = inventoryItem.slotSize || 1;
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

  await prisma.$transaction(async (tx) => {
    const omId = await roomsRepo.ensureOwnedMachineForInventoryTx(tx, inventoryItem);
    const newMiner = await roomsRepo.createUserMinerForRackTx(tx, {
      userId,
      slotIndex,
      minerId: inventoryItem.minerId,
      level: inventoryItem.level,
      hashRate: inventoryItem.hashRate,
      slotSize: inventoryItem.slotSize,
      imageUrl: display.imageUrl,
      isActive: true,
      ownedMachineId: omId,
    });

    await roomsRepo.updateRackInstallationTx(tx, rackId, {
      userMinerId: newMiner.id,
      installedAt: new Date(),
    });

    if (slotSize >= 2 && adjacentRack) {
      await roomsRepo.setRackBlockedByMinerTx(tx, adjacentRack.id, newMiner.id);
    }

    await roomsRepo.syncOwnedMachineSnapshotTx(tx, omId, "RACK", {
      minerId: inventoryItem.minerId,
      minerName: display.minerName,
      level: inventoryItem.level,
      hashRate: inventoryItem.hashRate,
      slotSize: inventoryItem.slotSize ?? 1,
      imageUrl: display.imageUrl,
    });

    await roomsRepo.deleteInventoryItemByIdTx(tx, inventoryId);
  });

  try {
    await miningEngine.reloadMinerProfile(userId);
  } catch {
    /* engine cache resync is best-effort — DB is already the source of truth */
  }

  return { inventoryItem: { minerName: inventoryItem.minerName } };
}

export async function uninstallMinerForUser(userId: number, rackId: number): Promise<void> {
  const preflight = await preflightUninstallMiner(userId, rackId);
  if (preflight) {
    throw new HttpStatusError(preflight.status, preflight.message, { code: preflight.code });
  }

  const rack = await roomsRepo.findRackWithMinerForUser(rackId, userId);
  if (!rack?.userMiner) {
    throw new HttpStatusError(404, "Rack não encontrado.");
  }

  const miner = rack.userMiner as MinerWithMinerRel;

  await prisma.$transaction(async (tx) => {
    await moveRackMinerBackToInventoryTx(tx, rack, miner, new Date());
  });

  try {
    await miningEngine.reloadMinerProfile(userId);
  } catch {
    /* engine cache resync is best-effort — DB is already the source of truth */
  }
}

export async function uninstallMinerBatchForUser(userId: number, rackIds: number[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const racks = await roomsRepo.findRacksWithMinersByIdsTx(tx, rackIds, userId);
    const racksById = new Map(racks.map((rack) => [rack.id, rack]));

    for (const rackId of rackIds) {
      const rack = racksById.get(rackId);
      if (!rack) throw new HttpStatusError(404, "RACK_NOT_FOUND");
      if (!rack.userMiner) throw new HttpStatusError(400, "RACK_EMPTY", { code: "RACK_EMPTY" });
    }

    const acquiredAt = new Date();
    for (const rackId of rackIds) {
      const rack = racksById.get(rackId)!;
      const installed = rack.userMiner as MinerWithMinerRel;
      await moveRackMinerBackToInventoryTx(tx, rack, installed, acquiredAt);
    }
  });

  try {
    await miningEngine.reloadMinerProfile(userId);
  } catch {
    /* engine cache resync is best-effort — DB is already the source of truth */
  }
}

export async function getSlotsSummaryForUser(userId: number) {
  const [totalRacks, occupiedRacks, inventoryCount] = await Promise.all([
    roomsRepo.countUserRacks(userId),
    roomsRepo.countOccupiedUserRacks(userId),
    roomsRepo.countUserInventory(userId),
  ]);

  return {
    ok: true as const,
    totalRacks,
    occupiedRacks,
    freeRacks: totalRacks - occupiedRacks,
    inventoryCount,
  };
}
