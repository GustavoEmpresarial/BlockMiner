import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
export async function listPendingInboxForUser(userId) {
    return prisma.userRewardInbox.findMany({
        where: { userId, status: "pending" },
        orderBy: { createdAt: "asc" },
    });
}
export async function findPendingInboxItem(userId, inboxId) {
    return prisma.userRewardInbox.findFirst({
        where: { id: inboxId, userId, status: "pending" },
    });
}
export async function markInboxItemCollectedTx(tx, inboxId, userId) {
    const result = await tx.userRewardInbox.updateMany({
        where: { id: inboxId, userId, status: "pending" },
        data: { status: "collected", collectedAt: new Date() },
    });
    return result.count;
}
export async function incrementUserPolBalanceTx(tx, userId, decimalValue) {
    await tx.user.update({ where: { id: userId }, data: { polBalance: { increment: decimalValue } } });
}
export async function incrementUserBlkBalanceTx(tx, userId, decimalValue) {
    await tx.user.update({ where: { id: userId }, data: { blkBalance: { increment: decimalValue } } });
}
export async function upsertBonusGameTx(tx, slug, name) {
    return tx.game.upsert({ where: { slug }, create: { name, slug, isActive: true }, update: {} });
}
export async function createUserPowerGameTx(tx, data) {
    await tx.userPowerGame.create({ data });
}
export async function createRewardInboxEntry(tx, payload) {
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
            metaJson: payload.metaJson ?? undefined,
        },
    });
}
