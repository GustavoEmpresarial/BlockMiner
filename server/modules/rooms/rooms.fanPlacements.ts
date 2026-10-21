import prisma from "../../core/database/prisma.js";
import { HttpStatusError } from "../../shared/errors/httpStatusError.js";
import { isFansFeatureEnabled } from "../fans/fans.config.js";
import { getFanCreditsForUser } from "../fans/fans.service.js";
import { syncUserBaseHashRate, miningEngine } from "../mining/index.js";
import { SLOTS_PER_VISUAL_RACK } from "./rooms.types.js";
import { logger } from "../../core/logger/index.js";

const log = logger.child("RoomsFanPlacements");

function visualCountFromSlots(slotCount: number, _roomNumber?: number | null): number {
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
      const visualCount = visualCountFromSlots(room._count.racks, room.roomNumber);
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
    select: { id: true, roomNumber: true, kind: true, _count: { select: { racks: true } } },
  });
  if (!room) throw new HttpStatusError(404, "Sala não encontrada.");

  const visualCount = visualCountFromSlots(room._count.racks, room.roomNumber);
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
    // One fan mutation per user at a time: without this, two concurrent mounts both passed the
    // credit check (users ended with fanCredits < 0) and two concurrent unmounts both credited.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId}::int, hashtext('fan-placement')::int)`;

    const existingAtDest = await tx.userVisualFanPlacement.findUnique({
      where: { roomId_visualIndex: { roomId: room.id, visualIndex } },
    });

    if (mounted) {
      if (existingAtDest) {
        if (fromVisualIndex != null && fromVisualIndex === visualIndex) return;
        throw new HttpStatusError(400, "Este rack já possui ventilador instalado.", { code: "FAN_OCCUPIED" });
      }

      if (fromVisualIndex != null) {
        // Move: only if a fan really sits at the source. Before, a "move" from an empty rack
        // created a fan for free (and unmounting it then minted a credit).
        const moved = await tx.userVisualFanPlacement.deleteMany({
          where: { roomId: room.id, visualIndex: fromVisualIndex, userId },
        });
        if (moved.count !== 1) {
          log.warn("FAN_NOT_AT_SOURCE", { userId, roomId: room.id, visualIndex, fromVisualIndex, severity: "WARNING", category: "SECURITY" });
          throw new HttpStatusError(409, "Não há ventilador nesse rack para mover.", { code: "FAN_NOT_AT_SOURCE" });
        }
      } else {
        const debited = await tx.user.updateMany({
          where: { id: userId, fanCredits: { gte: 1 } },
          data: { fanCredits: { decrement: 1 } },
        });
        if (debited.count !== 1) {
          throw new HttpStatusError(400, "Você não tem ventiladores disponíveis.", { code: "FAN_NO_CREDITS" });
        }
      }

      await tx.userVisualFanPlacement.create({ data: { userId, roomId: room.id, visualIndex } });
      return;
    }

    const removed = await tx.userVisualFanPlacement.deleteMany({
      where: { roomId: room.id, visualIndex, userId },
    });
    if (removed.count === 1) {
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

  await syncUserBaseHashRate(userId);
  try {
    await miningEngine.reloadMinerProfile(userId, { forceBalanceSync: true });
  } catch {
    /* engine profile reload is best-effort */
  }

  return { ok: true, mounted: rows.map((row) => row.visualIndex), fanCredits };
}
