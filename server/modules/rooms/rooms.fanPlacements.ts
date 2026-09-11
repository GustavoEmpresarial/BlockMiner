import prisma from "../../core/database/prisma.js";
import { HttpStatusError } from "../../shared/errors/httpStatusError.js";
import { isFansFeatureEnabled } from "../fans/fans.config.js";
import { getFanCreditsForUser } from "../fans/fans.service.js";
import { SLOTS_PER_VISUAL_RACK } from "./rooms.types.js";

function visualCountFromSlots(slotCount: number): number {
  return Math.max(0, Math.ceil(slotCount / SLOTS_PER_VISUAL_RACK));
}

async function rackIsOnFloor(roomId: number, visualIndex: number, visualCount: number): Promise<boolean> {
  const rows = await prisma.userVisualRackPlacement.findMany({
    where: { roomId },
    select: { visualIndex: true, floorSlot: true },
  });
  if (rows.length === 0) return visualIndex >= 0 && visualIndex < visualCount;
  const row = rows.find((r) => r.visualIndex === visualIndex);
  return row != null && row.floorSlot != null;
}

export async function listFanPlacementsForUser(userId: number) {
  if (!isFansFeatureEnabled()) {
    return { ok: true, fanCredits: 0, rooms: [] as Array<{
      roomId: number;
      roomNumber: number;
      visualCount: number;
      mounted: number[];
    }> };
  }
  const [rooms, fanCredits] = await Promise.all([
    prisma.userRoom.findMany({
      where: { userId },
      select: {
        id: true,
        roomNumber: true,
        _count: { select: { racks: true } },
        visualFanPlacements: {
          select: { visualIndex: true },
          orderBy: { visualIndex: "asc" },
        },
      },
      orderBy: { roomNumber: "asc" },
    }),
    getFanCreditsForUser(userId),
  ]);

  return {
    ok: true,
    fanCredits,
    rooms: rooms.map((room) => {
      const visualCount = visualCountFromSlots(room._count.racks);
      return {
        roomId: room.id,
        roomNumber: room.roomNumber,
        visualCount,
        mounted: room.visualFanPlacements
          .map((row) => row.visualIndex)
          .filter((i) => i >= 0 && i < visualCount),
      };
    }),
  };
}

export async function setFanPlacementForUser(
  userId: number,
  roomNumber: number,
  visualIndex: number,
  mounted: boolean,
  fromVisualIndex?: number | null,
) {
  if (!isFansFeatureEnabled()) {
    throw new HttpStatusError(410, "Ventiladores desativados.");
  }
  if (!Number.isInteger(roomNumber) || roomNumber <= 0) {
    throw new HttpStatusError(400, "Sala inválida.");
  }
  if (!Number.isInteger(visualIndex) || visualIndex < 0) {
    throw new HttpStatusError(400, "visualIndex inválido.");
  }
  if (fromVisualIndex != null && (!Number.isInteger(fromVisualIndex) || fromVisualIndex < 0)) {
    throw new HttpStatusError(400, "fromVisualIndex inválido.");
  }

  const room = await prisma.userRoom.findFirst({
    where: { userId, roomNumber },
    select: { id: true, _count: { select: { racks: true } } },
  });
  if (!room) throw new HttpStatusError(404, "Sala não encontrada.");

  const visualCount = visualCountFromSlots(room._count.racks);
  if (visualIndex >= visualCount) throw new HttpStatusError(400, "Rack visual inválido.");
  if (fromVisualIndex != null && fromVisualIndex >= visualCount) {
    throw new HttpStatusError(400, "Rack visual inválido.");
  }

  if (mounted) {
    const onFloor = await rackIsOnFloor(room.id, visualIndex, visualCount);
    if (!onFloor) {
      throw new HttpStatusError(400, "Coloque um rack antes do ventilador.", { code: "FAN_NEED_RACK" });
    }
  }

  await prisma.$transaction(async (tx) => {
    const existingAtDest = await tx.userVisualFanPlacement.findUnique({
      where: { roomId_visualIndex: { roomId: room.id, visualIndex } },
    });

    if (mounted && fromVisualIndex != null && fromVisualIndex !== visualIndex) {
      if (existingAtDest) {
        await tx.userVisualFanPlacement
          .delete({
            where: { roomId_visualIndex: { roomId: room.id, visualIndex: fromVisualIndex } },
          })
          .catch(() => undefined);
        return;
      }
      await tx.userVisualFanPlacement
        .delete({
          where: { roomId_visualIndex: { roomId: room.id, visualIndex: fromVisualIndex } },
        })
        .catch(() => undefined);
    }

    if (mounted) {
      const isMoveFromMountedSlot =
        fromVisualIndex != null && fromVisualIndex !== visualIndex && !existingAtDest;
      const isNewMountFromStorage = fromVisualIndex == null && !existingAtDest;

      if (isNewMountFromStorage) {
        const userRow = await tx.user.findUnique({
          where: { id: userId },
          select: { fanCredits: true },
        });
        if (Math.max(0, Number(userRow?.fanCredits ?? 0)) < 1) {
          throw new HttpStatusError(400, "Você não tem ventiladores disponíveis.", { code: "FAN_NO_CREDITS" });
        }
        await tx.user.update({
          where: { id: userId },
          data: { fanCredits: { decrement: 1 } },
        });
      }

      if (isMoveFromMountedSlot || isNewMountFromStorage || existingAtDest) {
        await tx.userVisualFanPlacement.upsert({
          where: { roomId_visualIndex: { roomId: room.id, visualIndex } },
          create: { userId, roomId: room.id, visualIndex },
          update: {},
        });
      }
      return;
    }

    const hadFan = await tx.userVisualFanPlacement.findUnique({
      where: { roomId_visualIndex: { roomId: room.id, visualIndex } },
    });
    if (hadFan) {
      await tx.userVisualFanPlacement.deleteMany({
        where: { roomId: room.id, visualIndex },
      });
      await tx.user.update({
        where: { id: userId },
        data: { fanCredits: { increment: 1 } },
      });
    }
  });

  const rows = await prisma.userVisualFanPlacement.findMany({
    where: { roomId: room.id },
    select: { visualIndex: true },
    orderBy: { visualIndex: "asc" },
  });
  const fanCredits = await getFanCreditsForUser(userId);
  return { ok: true, mounted: rows.map((row) => row.visualIndex), fanCredits };
}
