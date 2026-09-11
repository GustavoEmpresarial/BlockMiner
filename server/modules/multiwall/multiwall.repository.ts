/** Multiwall Ads PTC — Prisma access for S2S credits. */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";

export async function findUserForPostback(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isBanned: true },
  });
}

export async function createChargebackCallback(params: {
  userId: number;
  transId: string;
  offerName: string | null;
  offerType: string | null;
  payoutUsd: number;
  polPrice: number;
  status: number;
  clientIp: string;
  polDebited: number;
  polDebit: Prisma.Decimal;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.multiwallCallback.create({
      data: {
        userId: params.userId,
        transId: params.transId,
        offerName: params.offerName,
        offerType: params.offerType,
        payoutUsd: params.payoutUsd,
        polCredited: params.polDebited,
        polPrice: params.polPrice,
        status: params.status,
        requestIp: params.clientIp,
      },
    });
    await tx.user.update({
      where: { id: params.userId },
      data: { blkBalance: { decrement: params.polDebit } },
    });
    const after = await tx.user.findUnique({
      where: { id: params.userId },
      select: { blkBalance: true },
    });
    if (after && after.blkBalance.lessThan(0)) {
      await tx.user.update({ where: { id: params.userId }, data: { blkBalance: new Prisma.Decimal(0) } });
    }
  });
}

export async function createCreditCallback(params: {
  userId: number;
  transId: string;
  offerName: string | null;
  offerType: string | null;
  payoutUsd: number;
  polPrice: number;
  status: number;
  clientIp: string;
  polDecimal: Prisma.Decimal;
}) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.multiwallCallback.create({
      data: {
        userId: params.userId,
        transId: params.transId,
        offerName: params.offerName,
        offerType: params.offerType,
        payoutUsd: params.payoutUsd,
        polCredited: Number(params.polDecimal),
        polPrice: params.polPrice,
        status: params.status,
        requestIp: params.clientIp,
      },
    });
    await tx.user.update({
      where: { id: params.userId },
      data: { blkBalance: { increment: params.polDecimal } },
    });
    return created;
  });
}

export async function listCallbackHistory(userId: number, skip: number, take: number) {
  const [entries, total] = await Promise.all([
    prisma.multiwallCallback.findMany({
      where: { userId, status: 1 },
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        offerName: true,
        offerType: true,
        payoutUsd: true,
        polCredited: true,
        polPrice: true,
        createdAt: true,
      },
    }),
    prisma.multiwallCallback.count({ where: { userId, status: 1 } }),
  ]);
  return { entries, total };
}

export async function getStatsAggregates(
  userId: number,
  startOfDay: Date,
  startOfWeek: Date,
  startOfMonth: Date,
) {
  const [agg, offersToday, offersWeek, offersMonth] = await Promise.all([
    prisma.multiwallCallback.aggregate({
      where: { userId, status: 1 },
      _sum: { payoutUsd: true, polCredited: true },
      _count: { id: true },
    }),
    prisma.multiwallCallback.count({ where: { userId, status: 1, createdAt: { gte: startOfDay } } }),
    prisma.multiwallCallback.count({ where: { userId, status: 1, createdAt: { gte: startOfWeek } } }),
    prisma.multiwallCallback.count({ where: { userId, status: 1, createdAt: { gte: startOfMonth } } }),
  ]);
  return { agg, offersToday, offersWeek, offersMonth };
}
