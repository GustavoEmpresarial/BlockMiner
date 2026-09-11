import prisma from "../../core/database/prisma.js";
import { HttpStatusError } from "../../shared/errors/httpStatusError.js";
import { getRackCreditsForUser } from "../racks/racks.service.js";
import { SLOTS_PER_VISUAL_RACK } from "./rooms.types.js";

function visualCountFromSlots(slotCount: number): number {
  return Math.max(0, Math.ceil(slotCount / SLOTS_PER_VISUAL_RACK));
}

function defaultPlacements(visualCount: number) {
  return Array.from({ length: visualCount }, (_, i) => ({ visualIndex: i, floorSlot: i, purchased: false }));
}

export async function listVisualPlacementsForUser(userId: number) {
  const [rooms, rackCredits] = await Promise.all([
    prisma.userRoom.findMany({
      where: { userId },
      select: {
        id: true,
        roomNumber: true,
        _count: { select: { racks: true } },
        visualPlacements: {
          select: { visualIndex: true, floorSlot: true, purchased: true },
          orderBy: { visualIndex: "asc" },
        },
      },
      orderBy: { roomNumber: "asc" },
    }),
    getRackCreditsForUser(userId),
  ]);

  return {
    ok: true,
    rackCredits,
    rooms: rooms.map((room) => {
      const visualCount = visualCountFromSlots(room._count.racks);
      const placements =
        room.visualPlacements.length === 0
          ? defaultPlacements(visualCount)
          : room.visualPlacements.map((row) => ({
              visualIndex: row.visualIndex,
              floorSlot: row.floorSlot,
              purchased: Boolean(row.purchased),
            }));
      return { roomId: room.id, roomNumber: room.roomNumber, visualCount, placements };
    }),
  };
}

async function seedDefaultsIfEmpty(userId: number, roomId: number, visualCount: number) {
  await prisma.$transaction(async (tx) => {
    const count = await tx.userVisualRackPlacement.count({ where: { roomId } });
    if (count > 0) return;
    if (visualCount <= 0) return;
    await tx.userVisualRackPlacement.createMany({
      data: Array.from({ length: visualCount }, (_, i) => ({
        userId,
        roomId,
        visualIndex: i,
        floorSlot: i,
        purchased: false,
        updatedAt: new Date(),
      })),
    });
  });
}

export async function setVisualPlacementForUser(
  userId: number,
  roomNumber: number,
  visualIndex: number | null,
  floorSlot: number | null,
  fromCredit = false,
) {
  if (!Number.isInteger(roomNumber) || roomNumber <= 0) {
    throw new HttpStatusError(400, "Sala inválida.");
  }
  if (floorSlot != null && (!Number.isInteger(floorSlot) || floorSlot < 0)) {
    throw new HttpStatusError(400, "floorSlot inválido.");
  }

  const room = await prisma.userRoom.findFirst({
    where: { userId, roomNumber },
    select: {
      id: true,
      _count: { select: { racks: true } },
    },
  });
  if (!room) throw new HttpStatusError(404, "Sala não encontrada.");

  let visualCount = visualCountFromSlots(room._count.racks);
  await seedDefaultsIfEmpty(userId, room.id, visualCount);

  if (fromCredit) {
    if (floorSlot == null) {
      throw new HttpStatusError(400, "Posição inválida.", { code: "RACK_INVALID_PLACEMENT" });
    }
    if (floorSlot >= visualCount) {
      throw new HttpStatusError(400, "Posição inválida.");
    }
    return prisma.$transaction(async (tx) => {
      const userRow = await tx.user.findUnique({
        where: { id: userId },
        select: { rackCredits: true },
      });
      if (Math.max(0, Number(userRow?.rackCredits ?? 0)) < 1) {
        throw new HttpStatusError(400, "Você não tem racks disponíveis.", { code: "RACK_NO_CREDITS" });
      }

      const occupant = await tx.userVisualRackPlacement.findFirst({
        where: { roomId: room.id, floorSlot },
      });
      if (occupant?.floorSlot != null) {
        throw new HttpStatusError(400, "Posição ocupada.");
      }

      const maxPosRow = await tx.userRack.aggregate({
        where: { roomId: room.id },
        _max: { position: true },
      });
      const startPos = (maxPosRow._max.position ?? -1) + 1;
      const now = new Date();
      await tx.userRack.createMany({
        data: Array.from({ length: SLOTS_PER_VISUAL_RACK }, (_, i) => ({
          userId,
          roomId: room.id,
          position: startPos + i,
          installedAt: now,
        })),
      });

      const newVisualIndex = visualCount;
      visualCount += 1;

      await tx.userVisualRackPlacement.upsert({
        where: { roomId_visualIndex: { roomId: room.id, visualIndex: newVisualIndex } },
        create: {
          userId,
          roomId: room.id,
          visualIndex: newVisualIndex,
          floorSlot,
          purchased: true,
        },
        update: { floorSlot, purchased: true },
      });

      await tx.user.update({
        where: { id: userId },
        data: { rackCredits: { decrement: 1 } },
      });

      const rows = await tx.userVisualRackPlacement.findMany({
        where: { roomId: room.id },
        select: { visualIndex: true, floorSlot: true, purchased: true },
        orderBy: { visualIndex: "asc" },
      });
      const rackCredits = await getRackCreditsForUser(userId);
      return {
        ok: true,
        rackCredits,
        placements: rows.map((row) => ({
          visualIndex: row.visualIndex,
          floorSlot: row.floorSlot,
          purchased: Boolean(row.purchased),
        })),
      };
    });
  }

  if (visualIndex == null || !Number.isInteger(visualIndex) || visualIndex < 0) {
    throw new HttpStatusError(400, "visualIndex inválido.");
  }
  if (visualIndex >= visualCount) throw new HttpStatusError(400, "Rack visual inválido.");
  if (floorSlot != null && floorSlot >= visualCount) throw new HttpStatusError(400, "Posição inválida.");

  if (floorSlot == null) {
    const start = visualIndex * SLOTS_PER_VISUAL_RACK;
    const end = start + SLOTS_PER_VISUAL_RACK;
    const busy = await prisma.userRack.count({
      where: {
        roomId: room.id,
        position: { gte: start, lt: end },
        OR: [{ userMinerId: { not: null } }, { blockedByMinerId: { not: null } }],
      },
    });
    if (busy > 0) {
      throw new HttpStatusError(400, "Esvazie o rack antes de guardar.", { code: "RACK_NOT_EMPTY" });
    }
  }

  let creditReturned = false;
  await prisma.$transaction(async (tx) => {
    const current = await tx.userVisualRackPlacement.findUnique({
      where: { roomId_visualIndex: { roomId: room.id, visualIndex } },
    });

    if (floorSlot != null) {
      const occupant = await tx.userVisualRackPlacement.findFirst({
        where: { roomId: room.id, floorSlot, visualIndex: { not: visualIndex } },
      });
      if (occupant) {
        await tx.userVisualRackPlacement.update({
          where: { id: occupant.id },
          data: { floorSlot: current?.floorSlot ?? null },
        });
      }
    }

    await tx.userVisualRackPlacement.upsert({
      where: { roomId_visualIndex: { roomId: room.id, visualIndex } },
      create: {
        userId,
        roomId: room.id,
        visualIndex,
        floorSlot,
        purchased: false,
      },
      update: { floorSlot },
    });

    if (floorSlot == null && current?.purchased) {
      await tx.user.update({
        where: { id: userId },
        data: { rackCredits: { increment: 1 } },
      });
      creditReturned = true;
      await tx.userVisualRackPlacement.update({
        where: { roomId_visualIndex: { roomId: room.id, visualIndex } },
        data: { purchased: false },
      });
    }

    if (floorSlot == null) {
      await tx.userVisualFanPlacement.deleteMany({ where: { roomId: room.id, visualIndex } });
    }
  });

  const rows = await prisma.userVisualRackPlacement.findMany({
    where: { roomId: room.id },
    select: { visualIndex: true, floorSlot: true, purchased: true },
    orderBy: { visualIndex: "asc" },
  });
  const rackCredits = await getRackCreditsForUser(userId);
  return {
    ok: true,
    rackCredits,
    creditReturned,
    placements: rows.map((row) => ({
      visualIndex: row.visualIndex,
      floorSlot: row.floorSlot,
      purchased: Boolean(row.purchased),
    })),
  };
}
