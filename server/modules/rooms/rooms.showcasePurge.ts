/**
 * Purge and Refund migration for Showcase 3D Room and Racks.
 *
 * 1. Rescues all miners currently installed on room 101 / showcase_3d racks
 *    and moves them back into user_inventory via moveRackMinerBackToInventoryTx.
 * 2. Refunds BLK paid for 3D racks (e.g. User 136 paid 3.80 BLK) with audit log.
 * 3. Deletes all user_racks, visual placements, and user_rooms associated with room 101.
 */
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";
import { miningEngine } from "../mining/index.js";
import { invalidateMachinesListCache } from "../machines/machinesList.cache.js";
import { moveRackMinerBackToInventoryTx } from "./rooms.service.js";
import type { MinerWithMinerRel } from "./rooms.types.js";

const log = logger.child("ShowcasePurge");

export const SHOWCASE_3D_PURGE_MINER_ACTION = "SHOWCASE_3D_PURGE_MINER_TO_INVENTORY";
export const SHOWCASE_3D_RACK_REFUND_ACTION = "SHOWCASE_3D_RACK_REFUND";

export type PurgeAndRefundResult = {
  dryRun: boolean;
  minersEvacuated: number;
  refundsProcessed: Array<{ userId: number; amount: string }>;
  racksDeleted: number;
  roomsDeleted: number;
};

export async function runShowcase3dPurgeAndRefundMigration(
  options: { execute?: boolean } = {},
): Promise<PurgeAndRefundResult> {
  const execute = options.execute === true;

  // 1. Identify all miners installed in room 101 / showcase_3d
  const racksWithMiners = await prisma.userRack.findMany({
    where: {
      userMinerId: { not: null },
      room: {
        OR: [{ kind: "showcase_3d" }, { roomNumber: 101 }],
      },
    },
    include: {
      room: { select: { id: true, roomNumber: true } },
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

  // 2. Identify 3D rack purchases to refund
  const refundMap = new Map<number, number>();
  try {
    const purchaseRows = await prisma.callbackQueue.findMany({
      where: {
        callbackType: "SEC_IDEM",
      },
    });

    for (const row of purchaseRows) {
      const data = (row.data && typeof row.data === "object" ? row.data : {}) as Record<string, unknown>;
      const resp = (data.responseJson && typeof data.responseJson === "object" ? data.responseJson : {}) as Record<string, unknown>;
      if (resp.messageKey === "racks.showcase_3d_purchase_success" && resp.totalPrice != null) {
        const uid = row.userId;
        const total = Number(resp.totalPrice);
        if (Number.isFinite(total) && total > 0 && uid != null) {
          refundMap.set(uid, (refundMap.get(uid) ?? 0) + total);
        }
      }
    }
  } catch (err) {
    log.warn("Failed scanning callbackQueue for showcase rack purchases", { error: String(err) });
  }

  // Ensure known buyer User 136 (who bought 4 racks for 3.80 BLK total) is credited at least 3.80 BLK
  const current136 = refundMap.get(136) ?? 0;
  if (current136 < 3.80) {
    refundMap.set(136, 3.80);
  }

  if (!execute) {
    return {
      dryRun: true,
      minersEvacuated: racksWithMiners.length,
      refundsProcessed: Array.from(refundMap.entries()).map(([userId, amount]) => ({
        userId,
        amount: amount.toFixed(8),
      })),
      racksDeleted: 0,
      roomsDeleted: 0,
    };
  }

  // EXECUTE PHASE
  let minersEvacuated = 0;
  for (const rack of racksWithMiners) {
    if (!rack.userMiner) continue;
    const userId = rack.userId;
    const userMiner = rack.userMiner as MinerWithMinerRel;

    try {
      await prisma.$transaction(async (tx) => {
        const freshRack = await tx.userRack.findFirst({
          where: { id: rack.id, userMinerId: userMiner.id },
          select: { id: true, roomId: true, userId: true, userMinerId: true },
        });
        if (!freshRack?.userMinerId) return;

        const moved = await moveRackMinerBackToInventoryTx(
          tx,
          { id: rack.id, roomId: rack.roomId, userId },
          userMiner,
          new Date(),
        );

        await tx.auditLog.create({
          data: {
            userId,
            action: SHOWCASE_3D_PURGE_MINER_ACTION,
            source: "system",
            severity: "info",
            relatedEntityType: "user_rack",
            relatedEntityId: String(rack.id),
            detailsJson: JSON.stringify({
              rackId: rack.id,
              userMinerId: userMiner.id,
              roomNumber: rack.room.roomNumber,
              minerName: moved.minerName,
            }),
          },
        });
      });

      minersEvacuated += 1;
      try {
        await miningEngine.reloadMinerProfile(userId);
      } catch {
        /* best-effort */
      }
      invalidateMachinesListCache(userId);
    } catch (err) {
      log.error("Failed evacuating miner from showcase room", {
        rackId: rack.id,
        userMinerId: userMiner.id,
        error: String(err),
      });
    }
  }

  // Process refunds idempotently
  const refundsProcessed: Array<{ userId: number; amount: string }> = [];
  for (const [userId, refundAmount] of refundMap.entries()) {
    if (refundAmount <= 0) continue;

    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!userExists) continue;

    // Check if already refunded
    const existing = await prisma.auditLog.findFirst({
      where: {
        userId,
        action: SHOWCASE_3D_RACK_REFUND_ACTION,
      },
    });

    if (existing) {
      log.info("User already refunded for 3D racks, skipping", { userId });
      continue;
    }

    try {
      const amountStr = refundAmount.toFixed(8);
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: {
            blkBalance: { increment: refundAmount },
          },
        });

        await tx.auditLog.create({
          data: {
            userId,
            action: SHOWCASE_3D_RACK_REFUND_ACTION,
            source: "system",
            severity: "info",
            relatedEntityType: "user",
            relatedEntityId: String(userId),
            detailsJson: JSON.stringify({
              refundBlk: amountStr,
              currency: "BLK",
              reason: "Reembolso total de compras de racks 3D (descontinuacao da Sala 3D)",
            }),
          },
        });
      });

      refundsProcessed.push({ userId, amount: amountStr });
      try {
        await miningEngine.reloadMinerProfile(userId, { forceBalanceSync: true });
      } catch {
        /* best-effort */
      }
      log.info("Successfully refunded 3D rack purchase", { userId, refundAmount: amountStr });
    } catch (err) {
      log.error("Failed refunding user for 3D racks", { userId, refundAmount, error: String(err) });
    }
  }

  // Delete all racks, visual placements, and rooms for 101 / showcase_3d
  const targetRoomFilter = {
    OR: [{ kind: "showcase_3d" }, { roomNumber: 101 }],
  };

  const deletedPlacements = await prisma.userVisualRackPlacement.deleteMany({
    where: { room: targetRoomFilter },
  }).catch(() => ({ count: 0 }));

  const deletedFanPlacements = await prisma.userVisualFanPlacement.deleteMany({
    where: { room: targetRoomFilter },
  }).catch(() => ({ count: 0 }));

  const deletedRacks = await prisma.userRack.deleteMany({
    where: { room: targetRoomFilter },
  }).catch(() => ({ count: 0 }));

  const deletedRooms = await prisma.userRoom.deleteMany({
    where: targetRoomFilter,
  }).catch(() => ({ count: 0 }));

  log.info("Showcase 3D purge complete", {
    minersEvacuated,
    refundsProcessed: refundsProcessed.length,
    racksDeleted: deletedRacks.count,
    placementsDeleted: deletedPlacements.count + deletedFanPlacements.count,
    roomsDeleted: deletedRooms.count,
  });

  return {
    dryRun: false,
    minersEvacuated,
    refundsProcessed,
    racksDeleted: deletedRacks.count,
    roomsDeleted: deletedRooms.count,
  };
}
