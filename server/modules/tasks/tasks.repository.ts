import { Prisma } from "@prisma/client";
import prisma, { type TxClient } from "../../core/database/prisma.js";

export function activeDefinitionWhere(taskType: string, now: Date): Prisma.DailyTaskDefinitionWhereInput {
  return {
    isActive: true,
    taskType,
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
    ],
  };
}

export function activeDefinitionsInWindowWhere(now: Date): Prisma.DailyTaskDefinitionWhereInput {
  return {
    isActive: true,
    AND: [
      { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
      { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
    ],
  };
}

export async function findActiveDefinitionsByType(taskType: string, now: Date) {
  return prisma.dailyTaskDefinition.findMany({
    where: activeDefinitionWhere(taskType, now),
    orderBy: { sortOrder: "asc" },
  });
}

export async function findActiveDefinitions(now: Date) {
  return prisma.dailyTaskDefinition.findMany({
    where: activeDefinitionsInWindowWhere(now),
    orderBy: { sortOrder: "asc" },
  });
}

export async function findProgressForUserInPeriods(userId: number, periodKeys: string[]) {
  return prisma.userDailyTaskProgress.findMany({
    where: { userId, periodKey: { in: periodKeys } },
  });
}

export async function tryConsumeDedupe(tx: TxClient, taskDefinitionId: number, dedupeKey: string): Promise<boolean> {
  try {
    await tx.userDailyTaskDedupeTick.create({ data: { taskDefinitionId, dedupeKey } });
    return true;
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

export async function upsertProgressTx(
  tx: TxClient,
  args: { userId: number; taskDefinitionId: number; periodKey: string; delta: Prisma.Decimal },
) {
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

export async function markProgressCompletedTx(tx: TxClient, id: number, now: Date) {
  return tx.userDailyTaskProgress.updateMany({
    where: { id, completedAt: null, rewardClaimedAt: null },
    data: { completedAt: now },
  });
}

export async function findUserById(id: number) {
  return prisma.user.findUnique({ where: { id } });
}

export async function findActiveDefinitionById(id: number) {
  return prisma.dailyTaskDefinition.findFirst({ where: { id, isActive: true } });
}

export async function findProgressUnique(userId: number, taskDefinitionId: number, periodKey: string) {
  return prisma.userDailyTaskProgress.findUnique({
    where: { userId_taskDefinitionId_periodKey: { userId, taskDefinitionId, periodKey } },
  });
}

export async function lockProgressForClaimTx(tx: TxClient, progressId: number) {
  return tx.userDailyTaskProgress.updateMany({
    where: { id: progressId, rewardClaimedAt: null, completedAt: { not: null } },
    data: { rewardClaimedAt: new Date() },
  });
}

export async function createAuditLogTx(
  tx: TxClient,
  args: { userId: number; action: string; detailsJson: string },
) {
  return tx.auditLog.create({ data: args });
}

export async function findMinerRewardById(id: number) {
  return prisma.miner.findUnique({
    where: { id },
    select: { id: true, name: true, baseHashRate: true, imageUrl: true, slotSize: true },
  });
}

export async function findEventMinerRewardById(id: number) {
  return prisma.eventMiner.findUnique({
    where: { id },
    select: { name: true, imageUrl: true, hashRate: true, slotSize: true },
  });
}

// ─── admin CRUD ─────────────────────────────────────────────────────────────

export async function listDailyTaskDefinitions() {
  return prisma.dailyTaskDefinition.findMany({ orderBy: { sortOrder: "asc" } });
}

export async function findMinerById(id: number) {
  return prisma.miner.findUnique({ where: { id } });
}

export async function findEventMinerById(id: number) {
  return prisma.eventMiner.findUnique({ where: { id } });
}

export async function findInternalOfferwallOfferById(id: number) {
  return prisma.internalOfferwallOffer.findUnique({ where: { id } });
}

export async function updateDailyTaskDefinition(id: number, data: Prisma.DailyTaskDefinitionUpdateInput) {
  return prisma.dailyTaskDefinition.update({ where: { id }, data });
}

export async function findDailyTaskDefinitionById(id: number) {
  return prisma.dailyTaskDefinition.findUnique({ where: { id } });
}

export async function getMaxSortOrder(): Promise<number> {
  const agg = await prisma.dailyTaskDefinition.aggregate({ _max: { sortOrder: true } });
  return agg._max.sortOrder ?? 0;
}

export async function createDailyTaskDefinition(data: Prisma.DailyTaskDefinitionUncheckedCreateInput) {
  return prisma.dailyTaskDefinition.create({ data });
}

export async function deleteDailyTaskDefinition(id: number): Promise<void> {
  await prisma.dailyTaskDefinition.delete({ where: { id } });
}
