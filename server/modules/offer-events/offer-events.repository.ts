import prisma, { type TxClient } from "../../core/database/prisma.js";
import type { Prisma } from "@prisma/client";

export async function listActiveOfferEvents(where: Prisma.OfferEventWhereInput) {
  return prisma.offerEvent.findMany({
    where,
    include: {
      miners: {
        where: { isActive: true },
        orderBy: { id: "asc" },
      },
    },
    orderBy: [{ startsAt: "asc" }, { endsAt: "asc" }],
  });
}

export async function groupEventPurchaseClaimCounts(userId: number, eventMinerIds: number[]) {
  if (eventMinerIds.length === 0) return [];
  return prisma.eventPurchase.groupBy({
    by: ["eventMinerId"],
    where: { userId, eventMinerId: { in: eventMinerIds } },
    _count: { id: true },
  });
}

/** Ported from legacy offerEventsExpireCron.ts's deactivateExpiredOfferEvents. */
export async function deactivateExpiredOfferEventsWhere(now: Date) {
  return prisma.offerEvent.updateMany({
    where: {
      deletedAt: null,
      isActive: true,
      endsAt: { lt: now },
    },
    data: { isActive: false },
  });
}

export async function clearEventMinerOwnedImageSnapshots(eventMinerDisplayName: string): Promise<void> {
  const label = String(eventMinerDisplayName ?? "").trim();
  if (!label) return;
  const minerName = `[Event] ${label}`;
  const where = { minerId: null, minerName };
  const data = { imageUrl: null };

  const ownedRows = await prisma.userOwnedMachine.findMany({
    where,
    select: { id: true },
  });
  const ownedIds = ownedRows.map((r) => r.id);

  await Promise.all([
    prisma.userOwnedMachine.updateMany({ where, data }),
    prisma.userInventory.updateMany({ where, data }),
    prisma.userVault.updateMany({ where, data }),
    ownedIds.length > 0
      ? prisma.userMiner.updateMany({
          where: { ownedMachineId: { in: ownedIds } },
          data,
        })
      : Promise.resolve({ count: 0 }),
  ]);
}

export async function incrementSoldCountOptimistic(
  tx: TxClient,
  minerId: number,
  quantity = 1,
): Promise<{ id: number; soldCount: number; stockUnlimited: boolean; stockCount: number | null }> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const m = await tx.eventMiner.findUnique({ where: { id: minerId } });
    if (!m) {
      throw Object.assign(new Error("MINER_NOT_FOUND"), { code: "NOT_FOUND" });
    }
    if (!m.stockUnlimited) {
      const remaining = (m.stockCount || 0) - (m.soldCount || 0);
      if (remaining < quantity) {
        throw Object.assign(new Error("OUT_OF_STOCK"), { code: "OUT_OF_STOCK" });
      }
    }
    const res = await tx.eventMiner.updateMany({
      where: { id: minerId, soldCount: m.soldCount },
      data: { soldCount: { increment: quantity } },
    });
    if (res.count === 1) return m;
  }
  throw Object.assign(new Error("STOCK_BUSY"), { code: "CONFLICT" });
}
