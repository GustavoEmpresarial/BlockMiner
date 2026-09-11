/**
 * Ported from legacy/server/modules/zerads/infrastructure/repositories/zerads.repository.ts.
 *
 * Reward modules touch `User` balance columns directly inside their own $transaction —
 * there is no separate wallet-owned "credit balance" API yet in current/.
 *
 * Current deviation vs legacy: one DB row + balance credit per individual click
 * (provider may batch N clicks in a single S2S hit).
 */
import type { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";

export async function findUserByUsernameForCallback(username: string) {
  return prisma.user.findUnique({
    where: { username },
    select: { id: true, isBanned: true, username: true },
  });
}

export async function sumClicksInWindow(userId: number, start: Date, end: Date) {
  return prisma.zeradsCallback.aggregate({
    where: { userId, callbackAt: { gte: start, lt: end } },
    _sum: { clicks: true },
  });
}

export async function createCallbackAndCreditBalance(data: {
  userId: number;
  username: string;
  creditedZer: number;
  exchangeRate: number;
  blkToCredit: Prisma.Decimal | number;
  blkPerClick: Prisma.Decimal | number;
  creditedClicks: number;
  clientIp: string;
  callbackHash: string;
  now: Date;
}): Promise<void> {
  const clicks = Math.max(0, Math.trunc(data.creditedClicks));
  if (clicks <= 0) return;

  const zerPerClick = data.creditedZer / clicks;
  const blkPer = Number(data.blkPerClick);

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < clicks; i++) {
      await tx.zeradsCallback.create({
        data: {
          userId: data.userId,
          username: data.username,
          amountZer: zerPerClick,
          exchangeRate: data.exchangeRate,
          payoutAmount: blkPer,
          clicks: 1,
          requestIp: data.clientIp,
          callbackHash: `${data.callbackHash}:c${i}`,
          callbackAt: data.now,
        },
      });
    }
    await tx.user.update({
      where: { id: data.userId },
      data: { blkBalance: { increment: data.blkToCredit } },
    });
  });
}

export async function findUsernameById(userId: number) {
  return prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
}

export async function listCallbackHistory(userId: number, skip: number, take: number) {
  const [entries, total] = await Promise.all([
    prisma.zeradsCallback.findMany({
      where: { userId },
      orderBy: { callbackAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        amountZer: true,
        payoutAmount: true,
        clicks: true,
        callbackAt: true,
      },
    }),
    prisma.zeradsCallback.count({ where: { userId } }),
  ]);
  return { entries, total };
}

export async function getStatsAggregates(
  userId: number,
  startOfDay: Date,
  startOfWeek: Date,
  startOfMonth: Date,
) {
  const [agg, todayAgg, weekAgg, monthAgg] = await Promise.all([
    prisma.zeradsCallback.aggregate({
      where: { userId },
      _sum: { amountZer: true, payoutAmount: true, clicks: true },
      _count: { id: true },
    }),
    prisma.zeradsCallback.aggregate({
      where: { userId, callbackAt: { gte: startOfDay } },
      _sum: { clicks: true },
    }),
    prisma.zeradsCallback.aggregate({
      where: { userId, callbackAt: { gte: startOfWeek } },
      _sum: { clicks: true },
    }),
    prisma.zeradsCallback.aggregate({
      where: { userId, callbackAt: { gte: startOfMonth } },
      _sum: { clicks: true },
    }),
  ]);
  return { agg, todayAgg, weekAgg, monthAgg };
}
