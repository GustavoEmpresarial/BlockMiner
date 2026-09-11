import { Prisma } from "@prisma/client";
import prisma, { type TxClient } from "../../core/database/prisma.js";

export async function listPendingInboxForUser(userId: number) {
  return prisma.userRewardInbox.findMany({
    where: { userId, status: "pending" },
    orderBy: { createdAt: "asc" },
  });
}

export async function findPendingInboxItem(userId: number, inboxId: number) {
  return prisma.userRewardInbox.findFirst({
    where: { id: inboxId, userId, status: "pending" },
  });
}

export async function markInboxItemCollectedTx(tx: TxClient, inboxId: number, userId: number): Promise<number> {
  const result = await tx.userRewardInbox.updateMany({
    where: { id: inboxId, userId, status: "pending" },
    data: { status: "collected", collectedAt: new Date() },
  });
  return result.count;
}

export async function incrementUserPolBalanceTx(tx: TxClient, userId: number, decimalValue: Prisma.Decimal): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { polBalance: { increment: decimalValue } } });
}

export async function incrementUserBlkBalanceTx(tx: TxClient, userId: number, decimalValue: Prisma.Decimal): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { blkBalance: { increment: decimalValue } } });
}

export async function upsertBonusGameTx(tx: TxClient, slug: string, name: string) {
  return tx.game.upsert({ where: { slug }, create: { name, slug, isActive: true }, update: {} });
}

export async function createUserPowerGameTx(
  tx: TxClient,
  data: { userId: number; gameId: number; hashRate: number; playedAt: Date; expiresAt: Date },
): Promise<void> {
  await tx.userPowerGame.create({ data });
}

export type InboxRewardPayload = {
  userId: number;
  source: string;
  rewardType: string;
  rewardValue: number | string;
  minerId?: number | null;
  minerName?: string | null;
  minerImageUrl?: string | null;
  slotSize?: number;
  durationHours?: number | null;
  metaJson?: Record<string, unknown> | null;
};

export async function createRewardInboxEntry(tx: TxClient, payload: InboxRewardPayload) {
  return tx.userRewardInbox.create({
    data: {
      userId: payload.userId,
      status: "pending",
      source: payload.source,
      rewardType: payload.rewardType,
      rewardValue: new Prisma.Decimal(String(payload.rewardValue)),
      minerId: payload.minerId ?? null,
      minerName: payload.minerName ?? null,
      minerImageUrl: payload.minerImageUrl ?? null,
      slotSize: payload.slotSize ?? 1,
      durationHours: payload.durationHours ?? null,
      metaJson: (payload.metaJson as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
