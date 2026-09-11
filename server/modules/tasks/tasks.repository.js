import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
export function activeDefinitionWhere(taskType, now) {
    return {
        isActive: true,
        taskType,
        AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
            { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
    };
}
export function activeDefinitionsInWindowWhere(now) {
    return {
        isActive: true,
        AND: [
            { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
            { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
    };
}
export async function findActiveDefinitionsByType(taskType, now) {
    return prisma.dailyTaskDefinition.findMany({
        where: activeDefinitionWhere(taskType, now),
        orderBy: { sortOrder: "asc" },
    });
}
export async function findActiveDefinitions(now) {
    return prisma.dailyTaskDefinition.findMany({
        where: activeDefinitionsInWindowWhere(now),
        orderBy: { sortOrder: "asc" },
    });
}
export async function findProgressForUserInPeriods(userId, periodKeys) {
    return prisma.userDailyTaskProgress.findMany({
        where: { userId, periodKey: { in: periodKeys } },
    });
}
export async function tryConsumeDedupe(tx, taskDefinitionId, dedupeKey) {
    try {
        await tx.userDailyTaskDedupeTick.create({ data: { taskDefinitionId, dedupeKey } });
        return true;
    }
    catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
            return false;
        throw e;
    }
}
export async function upsertProgressTx(tx, args) {
    const { userId, taskDefinitionId, periodKey, delta } = args;
    await tx.userDailyTaskProgress.upsert({
        where: { userId_taskDefinitionId_periodKey: { userId, taskDefinitionId, periodKey } },
        create: { userId, taskDefinitionId, periodKey, currentValue: delta },
        update: { currentValue: { increment: delta } },
    });
    return tx.userDailyTaskProgress.findUnique({
        where: { userId_taskDefinitionId_periodKey: { userId, taskDefinitionId, periodKey } },
    });
}
export async function markProgressCompletedTx(tx, id, now) {
    return tx.userDailyTaskProgress.updateMany({
        where: { id, completedAt: null, rewardClaimedAt: null },
        data: { completedAt: now },
    });
}
export async function findUserById(id) {
    return prisma.user.findUnique({ where: { id } });
}
export async function findActiveDefinitionById(id) {
    return prisma.dailyTaskDefinition.findFirst({ where: { id, isActive: true } });
}
export async function findProgressUnique(userId, taskDefinitionId, periodKey) {
    return prisma.userDailyTaskProgress.findUnique({
        where: { userId_taskDefinitionId_periodKey: { userId, taskDefinitionId, periodKey } },
    });
}
export async function lockProgressForClaimTx(tx, progressId) {
    return tx.userDailyTaskProgress.updateMany({
        where: { id: progressId, rewardClaimedAt: null, completedAt: { not: null } },
        data: { rewardClaimedAt: new Date() },
    });
}
export async function createAuditLogTx(tx, args) {
    return tx.auditLog.create({ data: args });
}
export async function findMinerRewardById(id) {
    return prisma.miner.findUnique({
        where: { id },
        select: { id: true, name: true, baseHashRate: true, imageUrl: true, slotSize: true },
    });
}
export async function findEventMinerRewardById(id) {
    return prisma.eventMiner.findUnique({
        where: { id },
        select: { name: true, imageUrl: true, hashRate: true, slotSize: true },
    });
}
// ─── admin CRUD ─────────────────────────────────────────────────────────────
export async function listDailyTaskDefinitions() {
    return prisma.dailyTaskDefinition.findMany({ orderBy: { sortOrder: "asc" } });
}
export async function findMinerById(id) {
    return prisma.miner.findUnique({ where: { id } });
}
export async function findEventMinerById(id) {
    return prisma.eventMiner.findUnique({ where: { id } });
}
export async function findInternalOfferwallOfferById(id) {
    return prisma.internalOfferwallOffer.findUnique({ where: { id } });
}
export async function updateDailyTaskDefinition(id, data) {
    return prisma.dailyTaskDefinition.update({ where: { id }, data });
}
export async function findDailyTaskDefinitionById(id) {
    return prisma.dailyTaskDefinition.findUnique({ where: { id } });
}
export async function getMaxSortOrder() {
    const agg = await prisma.dailyTaskDefinition.aggregate({ _max: { sortOrder: true } });
    return agg._max.sortOrder ?? 0;
}
export async function createDailyTaskDefinition(data) {
    return prisma.dailyTaskDefinition.create({ data });
}
export async function deleteDailyTaskDefinition(id) {
    await prisma.dailyTaskDefinition.delete({ where: { id } });
}
