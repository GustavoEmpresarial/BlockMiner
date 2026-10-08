/**
 * Ported from legacy/server/modules/rooms/application/rooms.service.ts.
 *
 * Deviations (documented, same as shop/inventory/shortlinks):
 * - advisoryXactTryLockOrThrow not ported — buy room and buy showcase rack take
 *   pg_advisory_xact_lock inside the transaction that also checks blkBalance.
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
import { Prisma as PrismaNs } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import { HttpStatusError } from "../../shared/errors/httpStatusError.js";
import { logger } from "../../core/logger/index.js";
import { miningEngine } from "../mining/index.js";
import { createNotification } from "../notifications/index.js";
import { getRoomPriceQuote } from "./rooms.config.js";
import {
  decideShowcaseInstall,
  isShowcase3dMiner,
  isShowcaseRoom,
  isShowcaseRoomEnabledForUser,
  nextStandardRoomNumber,
  readShowcaseRackPrice,
  SHOWCASE_3D_ROOM_KIND,
  SHOWCASE_3D_ROOM_NUMBER,
  SHOWCASE_RACK_BAYS,
  SHOWCASE_RACK_OFFER_PRICE_BLK,
  SHOWCASE_RACK_SHOP_PRICE_BLK,
  SHOWCASE_RACKS_PER_ROOM,
  nextShowcaseRackLayout,
  resolveShowcaseFloorSlot,
  type ShowcaseMinerRef,
} from "./rooms.showcase.js";
import {
  minerRefFromInstalled,
  SHOWCASE_3D_COMMON_MIGRATE_AUDIT_ACTION,
} from "./rooms.showcaseCommonMigration.js";
import { ROOMS_ERROR } from "./rooms.errors.js";
import { buildListedRoomsPayload, countRackTotals } from "./rooms.dto.js";
import {
  isRackSlotOccupied,
  isRowEdgeViolation,
  isTwoSlotSpillFromPrevious,
  rackSlotIndex,
} from "./rooms.placement.js";
import { resolveOwnedMachineDisplay } from "../machines/ownedMachineDisplay.js";
import { getMachinesListCache, invalidateMachinesListCache, setMachinesListCache } from "../machines/machinesList.cache.js";
import * as roomsRepo from "./rooms.repository.js";
import { RACKS_PER_ROOM, ROOM_MAX, starterRackSlotCount, type MinerWithMinerRel, type RackMoveBackRow } from "./rooms.types.js";

const log = logger.child("rooms.service");

function isUniqueViolation(err: unknown): boolean {
  return err instanceof PrismaNs.PrismaClientKnownRequestError && err.code === "P2002";
}

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
  type RoomsPayload = {
    ok: true;
    rooms: ReturnType<typeof buildListedRoomsPayload>;
    totalRacks: number;
    occupiedRacks: number;
    freeRacks: number;
  };
  const cached = getMachinesListCache<RoomsPayload>("rooms", userId);
  if (cached) return cached;

  const now = new Date();
  if (isShowcaseRoomEnabledForUser(userId)) await ensureShowcaseRoomForUser(userId);
  const rooms = await roomsRepo.findRoomsWithRacksForUser(userId);
  const result = buildListedRoomsPayload(rooms, undefined, now, userId);
  const { totalRacks, occupiedRacks, freeRacks } = countRackTotals(rooms);
  const payload: RoomsPayload = { ok: true as const, rooms: result, totalRacks, occupiedRacks, freeRacks };
  setMachinesListCache("rooms", userId, payload);
  return payload;
}

export async function countUnlockedRoomsForUser(userId: number): Promise<number> {
  const existing = await roomsRepo.findUserRoomsOrdered(userId);
  return nextStandardRoomNumber(existing.map((room) => room.roomNumber)) - 1;
}

export async function ensureShowcaseRoomForUser(userId: number): Promise<{ id: number } | null> {
  const found = await prisma.userRoom.findFirst({
    where: { userId, roomNumber: SHOWCASE_3D_ROOM_NUMBER },
    select: { id: true },
  });
  if (found) return found;
  try {
    return await prisma.userRoom.create({
      data: {
        userId,
        roomNumber: SHOWCASE_3D_ROOM_NUMBER,
        pricePaid: 0,
        kind: SHOWCASE_3D_ROOM_KIND,
      },
      select: { id: true },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return prisma.userRoom.findFirst({
      where: { userId, roomNumber: SHOWCASE_3D_ROOM_NUMBER },
      select: { id: true },
    });
  }
}

export type BuyRoomResult =
  | { ok: true; roomNumber: number; roomId: number; message: string }
  | { ok: false; status: number; code?: string; message: string };

export async function buyRoomForUser(userId: number): Promise<BuyRoomResult> {
  log.info("buyRoom attempt", { userId });
  const existing = await roomsRepo.findUserRoomsOrdered(userId);
  const nextRoom = nextStandardRoomNumber(existing.map((room) => room.roomNumber));

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

  invalidateMachinesListCache(userId);

  return {
    ok: true,
    roomNumber: nextRoom,
    roomId: newRoom.id,
    message: `Sala ${nextRoom} desbloqueada com sucesso!`,
  };
}

export type BuyShowcaseRackResult =
  | { ok: true; price: number; roomId: number; message: string }
  | { ok: false; status: number; code?: string; message: string };

type ShowcasePayChannel = "shop" | "offer" | "room";

const SHOWCASE_CHANNEL_MESSAGE_KEY: Record<string, string> = {
  SHOWCASE_ROOM_DISABLED: "racks.errors.showcase_forbidden",
  SHOWCASE_RACK_FULL: "racks.errors.showcase_full",
  SHOWCASE_RACK_OCCUPIED: "racks.errors.showcase_full",
  RACK_INVALID_PLACEMENT: "racks.errors.showcase_invalid_quantity",
  INSUFFICIENT_BALANCE: "racks.errors.insufficient_balance",
  SHOWCASE_RACK_INVALID_QUANTITY: "racks.errors.showcase_invalid_quantity",
};

function showcaseUnitPrice(channel: ShowcasePayChannel): PrismaNs.Decimal {
  if (channel === "shop") return new PrismaNs.Decimal(SHOWCASE_RACK_SHOP_PRICE_BLK);
  if (channel === "offer") return new PrismaNs.Decimal(SHOWCASE_RACK_OFFER_PRICE_BLK);
  return new PrismaNs.Decimal(String(readShowcaseRackPrice()));
}

type InstalledShowcaseRacks = {
  roomId: number;
  quantity: number;
  unitPrice: PrismaNs.Decimal;
  totalPrice: PrismaNs.Decimal;
  newBalance: PrismaNs.Decimal;
  rackCredits: number;
};

/**
 * One transaction: room lock, capacity, balance, debit, then rack rows.
 * Shop and offers pay the channel price. The in-room endpoint keeps readShowcaseRackPrice().
 */
async function installPaidShowcaseRacks(input: {
  userId: number;
  quantity: number;
  channel: ShowcasePayChannel;
  floorSlot: number | null;
}): Promise<InstalledShowcaseRacks> {
  const { userId, channel, floorSlot } = input;
  if (!isShowcaseRoomEnabledForUser(userId)) {
    throw new HttpStatusError(403, "A Sala 3D está indisponível.", { code: "SHOWCASE_ROOM_DISABLED" });
  }
  const quantity = input.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > SHOWCASE_RACKS_PER_ROOM) {
    throw new HttpStatusError(400, "Quantidade inválida.", { code: "SHOWCASE_RACK_INVALID_QUANTITY" });
  }
  const unitPrice = showcaseUnitPrice(channel);
  const totalPrice = unitPrice.mul(quantity);
  if (totalPrice.lt(0) || (totalPrice.lte(0) && channel !== "room")) {
    throw new HttpStatusError(400, "Quantidade inválida.", { code: "SHOWCASE_RACK_INVALID_QUANTITY" });
  }
  log.info("buyShowcaseRack attempt", { userId, channel, quantity });

  const installed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, ${SHOWCASE_3D_ROOM_NUMBER}::int)`;

    let room = await tx.userRoom.findFirst({
      where: { userId, roomNumber: SHOWCASE_3D_ROOM_NUMBER },
      select: { id: true },
    });
    if (!room) {
      room = await tx.userRoom.create({
        data: {
          userId,
          roomNumber: SHOWCASE_3D_ROOM_NUMBER,
          pricePaid: 0,
          kind: SHOWCASE_3D_ROOM_KIND,
        },
        select: { id: true },
      });
    }

    const rackRowCount = await tx.userRack.count({ where: { roomId: room.id } });
    let rows = rackRowCount;
    const layouts: Array<{ visualIndex: number; positions: number[] }> = [];
    for (let i = 0; i < quantity; i += 1) {
      const nextRack = nextShowcaseRackLayout(rows);
      if (!nextRack) {
        throw new HttpStatusError(400, "Esta sala já tem 24 racks.", { code: "SHOWCASE_RACK_FULL" });
      }
      layouts.push(nextRack);
      rows += SHOWCASE_RACK_BAYS;
    }

    const taken = await tx.userVisualRackPlacement.findMany({
      where: { roomId: room.id },
      select: { floorSlot: true },
    });
    const takenSlots = taken.flatMap((row) => (row.floorSlot == null ? [] : [row.floorSlot]));
    const asCredit = channel !== "room" && floorSlot == null;
    const floors: Array<number | null> = [];
    if (asCredit) {
      for (let i = 0; i < layouts.length; i += 1) floors.push(null);
    } else if (floorSlot != null) {
      if (quantity !== 1) {
        throw new HttpStatusError(400, "Posição inválida.", { code: "RACK_INVALID_PLACEMENT" });
      }
      const floor = resolveShowcaseFloorSlot(floorSlot, takenSlots);
      if (!floor.ok) {
        const message =
          floor.code === "SHOWCASE_RACK_OCCUPIED"
            ? "Posição ocupada."
            : floor.code === "RACK_INVALID_PLACEMENT"
              ? "Posição inválida."
              : "Esta sala já tem 24 racks.";
        throw new HttpStatusError(400, message, { code: floor.code });
      }
      floors.push(floor.floorSlot);
    } else {
      const takenSet = new Set(takenSlots);
      for (let slot = 0; slot < SHOWCASE_RACKS_PER_ROOM && floors.length < quantity; slot += 1) {
        if (!takenSet.has(slot)) floors.push(slot);
      }
      if (floors.length < quantity) {
        throw new HttpStatusError(400, "Esta sala já tem 24 racks.", { code: "SHOWCASE_RACK_FULL" });
      }
    }

    const balanceUser = await roomsRepo.findUserBlkBalanceTx(tx, userId);
    if (!balanceUser) {
      throw new HttpStatusError(404, "Usuário não encontrado.");
    }
    const balance = new PrismaNs.Decimal(balanceUser.blkBalance.toString());
    if (balance.lt(totalPrice)) {
      throw new HttpStatusError(400, "Saldo BLK insuficiente para comprar este rack.", {
        code: "INSUFFICIENT_BALANCE",
      });
    }
    if (totalPrice.gt(0)) {
      await roomsRepo.decrementUserBalanceTx(tx, userId, totalPrice);
    }

    const now = new Date();
    await roomsRepo.createRacksBatchTx(
      tx,
      layouts.flatMap((layout) =>
        layout.positions.map((position) => ({
          userId,
          roomId: room.id,
          position,
          installedAt: now,
        })),
      ),
    );
    for (let i = 0; i < layouts.length; i += 1) {
      await tx.userVisualRackPlacement.create({
        data: {
          userId,
          roomId: room.id,
          visualIndex: layouts[i].visualIndex,
          floorSlot: floors[i],
          purchased: false,
        },
      });
    }

    const updated = await tx.user.findUnique({
      where: { id: userId },
      select: { blkBalance: true, rackCredits: true },
    });
    if (!updated) {
      throw new HttpStatusError(404, "Usuário não encontrado.");
    }
    return {
      roomId: room.id,
      quantity,
      unitPrice,
      totalPrice,
      newBalance: new PrismaNs.Decimal(updated.blkBalance.toString()),
      rackCredits: Math.max(0, Number(updated.rackCredits ?? 0)),
    };
  });

  invalidateMachinesListCache(userId);
  try {
    await miningEngine.reloadMinerProfile(userId, { forceBalanceSync: true });
  } catch {
    /* best-effort */
  }
  return installed;
}

export async function buyShowcaseRackForUser(
  userId: number,
  floorSlot: number | null = null,
): Promise<BuyShowcaseRackResult> {
  try {
    const installed = await installPaidShowcaseRacks({
      userId,
      quantity: 1,
      channel: "room",
      floorSlot,
    });
    return {
      ok: true,
      price: installed.unitPrice.toNumber(),
      roomId: installed.roomId,
      message: "Rack 3D instalado.",
    };
  } catch (err) {
    if (err instanceof HttpStatusError) {
      return { ok: false, status: err.http, code: err.code, message: err.message };
    }
    throw err;
  }
}

export type ShowcaseChannelPurchaseResult =
  | {
      ok: true;
      quantity: number;
      unitPrice: string;
      totalPrice: string;
      newBalance: string;
      rackCredits: number;
      roomId: number;
    }
  | { ok: false; status: number; code: string; messageKey: string; message: string };

export async function purchaseShowcaseRacksForChannel(
  userId: number,
  quantity: number,
  channel: "shop" | "offer",
): Promise<ShowcaseChannelPurchaseResult> {
  try {
    const installed = await installPaidShowcaseRacks({
      userId,
      quantity,
      channel,
      floorSlot: null,
    });
    return {
      ok: true,
      quantity: installed.quantity,
      unitPrice: installed.unitPrice.toFixed(8),
      totalPrice: installed.totalPrice.toFixed(8),
      newBalance: installed.newBalance.toFixed(8),
      rackCredits: installed.rackCredits,
      roomId: installed.roomId,
    };
  } catch (err) {
    if (err instanceof HttpStatusError) {
      const code = err.code ?? "SHOWCASE_RACK_PURCHASE_ERROR";
      return {
        ok: false,
        status: err.http,
        code,
        messageKey: SHOWCASE_CHANNEL_MESSAGE_KEY[code] ?? "racks.errors.purchase_error",
        message: err.message,
      };
    }
    throw err;
  }
}

function showcaseMinerFromInventory(item: {
  minerName?: string | null;
  imageUrl?: string | null;
  miner?: { name?: string | null; imageUrl?: string | null } | null;
  ownedMachine?: {
    minerName?: string | null;
    imageUrl?: string | null;
    eventMiner?: { name?: string | null; imageUrl?: string | null; modelUrl?: string | null } | null;
  } | null;
}): ShowcaseMinerRef {
  const eventMiner = item.ownedMachine?.eventMiner;
  return {
    modelUrl: eventMiner?.modelUrl ?? null,
    minerName: eventMiner?.name ?? item.ownedMachine?.minerName ?? item.minerName ?? item.miner?.name ?? null,
    imageUrl:
      item.imageUrl ??
      item.ownedMachine?.imageUrl ??
      eventMiner?.imageUrl ??
      item.miner?.imageUrl ??
      null,
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

  const showcase = isShowcaseRoom(rack.room);

  if (!showcase && rack.position > 0) {
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

  if (showcase) {
    if (!isShowcaseRoomEnabledForUser(userId)) {
      return { status: 403, code: "SHOWCASE_ROOM_DISABLED", message: "A Sala 3D está indisponível." };
    }
    const decision = decideShowcaseInstall(showcaseMinerFromInventory(inventoryItem));
    if (!decision.ok) {
      return {
        status: 400,
        code: decision.code,
        message: "Esta sala só aceita máquinas 3D.",
      };
    }
    return {
      rack,
      inventoryItem,
      adjacentRack: null,
      slotIndex: rackSlotIndex(rack.room.roomNumber, rack.position),
    };
  } else if (isShowcase3dMiner(showcaseMinerFromInventory(inventoryItem))) {
    return {
      status: 400,
      code: ROOMS_ERROR.SHOWCASE_3D_FITS_ONLY,
      message: "Esta máquina só pode ser instalada na Sala 3D.",
    };
  }

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

  try {
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
  } catch (err) {
    // The preflight occupancy check (resolveInstallMinerContext, above) reads before this
    // transaction writes — a genuine TOCTOU window under concurrent installs into the same
    // rack. The `@@unique([userId, slotIndex])` constraint on UserMiner is the real backstop
    // (confirmed by a concurrent-install integration test: exactly one writer ever wins,
    // never a double-install), but until this catch, the loser's P2002 surfaced as an
    // unhandled 500 instead of the same clean, already-established RACE_CONDITION_DETECTED
    // shape every other mutation in this codebase (machines/, shop/, offer-events/) returns.
    if (isUniqueViolation(err)) {
      return {
        status: 409,
        code: "RACE_CONDITION_DETECTED",
        message: "This action conflicted with another request. Refresh the page and try again.",
      };
    }
    throw err;
  }

  try {
    await miningEngine.reloadMinerProfile(userId);
  } catch {
    /* engine cache resync is best-effort — DB is already the source of truth */
  }

  invalidateMachinesListCache(userId);

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

  invalidateMachinesListCache(userId);
}

/**
 * Etapa B helper: one common-room 3D miner → inventory via {@link moveRackMinerBackToInventoryTx}.
 * Idempotent when the rack is already empty or no longer a 3D target (no-op skip).
 * Audit row is written in the same transaction as the move.
 */
export async function migrateShowcase3dCommonRackToInventory(args: {
  userId: number;
  rackId: number;
}): Promise<{ minerName: string; hashRate: number; userMinerId: number; skipped?: boolean }> {
  const { userId, rackId } = args;
  const rack = await prisma.userRack.findFirst({
    where: { id: rackId, userId },
    include: {
      room: { select: { roomNumber: true, kind: true } },
      userMiner: {
        include: {
          miner: { select: { name: true, imageUrl: true } },
          ownedMachine: {
            select: {
              minerName: true,
              imageUrl: true,
              eventMiner: { select: { name: true, imageUrl: true, modelUrl: true } },
            },
          },
        },
      },
    },
  });

  if (!rack?.userMiner) {
    return { minerName: "", hashRate: 0, userMinerId: 0, skipped: true };
  }
  if (isShowcaseRoom(rack.room) || rack.room.roomNumber < 1 || rack.room.roomNumber > ROOM_MAX) {
    throw new HttpStatusError(400, "Rack is not in a common room.", {
      code: "SHOWCASE_3D_MIGRATE_WRONG_ROOM",
    });
  }
  const ref = minerRefFromInstalled(rack.userMiner);
  if (!isShowcase3dMiner(ref)) {
    return { minerName: "", hashRate: 0, userMinerId: 0, skipped: true };
  }

  const miner = rack.userMiner as MinerWithMinerRel;
  const hashRate = Number(miner.hashRate) || 0;
  const userMinerId = miner.id;
  let minerName = "";

  await prisma.$transaction(async (tx) => {
    const still = await tx.userRack.findFirst({
      where: { id: rackId, userId, userMinerId },
      select: { id: true, roomId: true, userId: true, userMinerId: true },
    });
    if (!still?.userMinerId) {
      return;
    }
    const moved = await moveRackMinerBackToInventoryTx(
      tx,
      { id: rack.id, roomId: rack.roomId, userId: rack.userId },
      miner,
      new Date(),
    );
    minerName = moved.minerName;
    await tx.auditLog.create({
      data: {
        userId,
        action: SHOWCASE_3D_COMMON_MIGRATE_AUDIT_ACTION,
        source: "system",
        severity: "info",
        relatedEntityType: "user_rack",
        relatedEntityId: String(rackId),
        detailsJson: JSON.stringify({
          rackId,
          userMinerId,
          hashRate,
          roomNumber: rack.room.roomNumber,
          minerName: moved.minerName,
        }),
      },
    });
  });

  if (!minerName) {
    return { minerName: "", hashRate: 0, userMinerId: 0, skipped: true };
  }

  try {
    await miningEngine.reloadMinerProfile(userId);
  } catch {
    /* best-effort */
  }
  invalidateMachinesListCache(userId);
  return { minerName, hashRate, userMinerId };
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

  invalidateMachinesListCache(userId);
}

export async function getSlotsSummaryForUser(userId: number) {
  type SlotsPayload = {
    ok: true;
    totalRacks: number;
    occupiedRacks: number;
    freeRacks: number;
    inventoryCount: number;
  };
  const cached = getMachinesListCache<SlotsPayload>("slots", userId);
  if (cached) return cached;

  const [totalRacks, occupiedRacks, inventoryCount] = await Promise.all([
    roomsRepo.countUserRacks(userId),
    roomsRepo.countOccupiedUserRacks(userId),
    roomsRepo.countUserInventory(userId),
  ]);

  const payload: SlotsPayload = {
    ok: true as const,
    totalRacks,
    occupiedRacks,
    freeRacks: totalRacks - occupiedRacks,
    inventoryCount,
  };
  setMachinesListCache("slots", userId, payload);
  return payload;
}
