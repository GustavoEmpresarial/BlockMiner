import prisma from "../../core/database/prisma.js";
import type { TxClient } from "../../core/database/prisma.js";

export async function findCompletionStatus(userId: number) {
  return prisma.shortlinkCompletion.findUnique({ where: { userId } });
}

export async function createCompletionStatus(userId: number) {
  return prisma.shortlinkCompletion.create({
    data: { userId, currentStep: 0, dailyRuns: 0 },
  });
}

export async function resetDailyRuns(userId: number, resetAt: Date) {
  return prisma.shortlinkCompletion.update({
    where: { userId },
    data: { dailyRuns: 0, resetAt },
  });
}

export async function upsertSessionStart(userId: number, sessionToken: string, stepStartedAt: Date) {
  return prisma.shortlinkCompletion.upsert({
    where: { userId },
    update: { currentStep: 0, sessionToken, stepStartedAt },
    create: { userId, currentStep: 0, dailyRuns: 0, sessionToken, stepStartedAt },
  });
}

export async function findCompletionStatusTx(tx: TxClient, userId: number) {
  return tx.shortlinkCompletion.findUnique({ where: { userId } });
}

export async function updateStepProgressTx(
  tx: TxClient,
  userId: number,
  data: {
    currentStep: number;
    dailyRunsIncrement?: number;
    completedAt?: Date;
    sessionToken: string | null;
    stepStartedAt: Date | null;
  },
) {
  await tx.shortlinkCompletion.update({
    where: { userId },
    data: {
      currentStep: data.currentStep,
      dailyRuns: data.dailyRunsIncrement ? { increment: data.dailyRunsIncrement } : undefined,
      completedAt: data.completedAt,
      sessionToken: data.sessionToken,
      stepStartedAt: data.stepStartedAt,
    },
  });
}

export async function createShortlinkPowerTx(
  tx: TxClient,
  data: { userId: number; hashRate: number; claimedAt: Date; expiresAt: Date },
) {
  await tx.shortlinkPower.create({ data });
}

export async function createAuditLogRowTx(
  tx: TxClient,
  data: {
    userId: number;
    action: string;
    detailsJson: string;
    ip: string | null;
    userAgent: string | null;
  },
) {
  await tx.auditLog.create({
    data: {
      userId: data.userId,
      action: data.action,
      detailsJson: data.detailsJson,
      ip: data.ip,
      userAgent: data.userAgent,
    },
  });
}

export async function expireAllStalePendingExternalSessions(provider: string, olderThan: Date) {
  const result = await prisma.shortlinkExternalSession.updateMany({
    where: { provider, status: "pending", createdAt: { lt: olderThan } },
    data: { status: "expired" },
  });
  return result.count;
}

export async function expirePendingExternalSessions(userId: number, provider: string, olderThan: Date) {
  await prisma.shortlinkExternalSession.updateMany({
    where: { userId, provider, status: "pending", createdAt: { lt: olderThan } },
    data: { status: "expired" },
  });
}

export async function cancelPendingExternalSessions(userId: number, provider: string) {
  await prisma.shortlinkExternalSession.updateMany({
    where: { userId, provider, status: "pending" },
    data: { status: "expired" },
  });
}

export async function createExternalSession(data: {
  userId: number;
  provider: string;
  token: string;
  hashRate: number;
}) {
  return prisma.shortlinkExternalSession.create({ data });
}

export async function findActivePendingExternalSession(
  userId: number,
  provider: string,
  notOlderThan: Date,
) {
  return prisma.shortlinkExternalSession.findFirst({
    where: { userId, provider, status: "pending", createdAt: { gte: notOlderThan } },
    orderBy: { createdAt: "desc" },
  });
}

export async function findPendingExternalSession(userId: number, provider: string, token: string) {
  return prisma.shortlinkExternalSession.findFirst({
    where: { userId, provider, token, status: "pending" },
  });
}

export async function markExternalSessionDone(sessionId: number, doneAt: Date) {
  await prisma.shortlinkExternalSession.updateMany({
    where: { id: sessionId, status: "pending", doneAt: null },
    data: { doneAt },
  });
}

export async function countCompletedExternalToday(
  userId: number,
  provider: string,
  dayStart: Date,
  dayEnd: Date,
) {
  return prisma.shortlinkExternalSession.count({
    where: {
      userId,
      provider,
      status: "completed",
      completedAt: { gte: dayStart, lt: dayEnd },
    },
  });
}

export async function loadPasteadStatusSnapshot(
  userId: number,
  provider: string,
  dayStart: Date,
  dayEnd: Date,
  notOlderThan: Date,
) {
  const [dailyRuns, activePending] = await Promise.all([
    countCompletedExternalToday(userId, provider, dayStart, dayEnd),
    findActivePendingExternalSession(userId, provider, notOlderThan),
  ]);
  return { dailyRuns, activePending };
}

export async function completeExternalSessionTx(tx: TxClient, sessionId: number, completedAt: Date) {
  await tx.shortlinkExternalSession.update({
    where: { id: sessionId },
    data: { status: "completed", completedAt },
  });
}
