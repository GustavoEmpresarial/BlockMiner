// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Ported from legacy/server/modules/offerwallme/infrastructure/repositories/offerwallme.repository.ts. */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
export async function findUserForPostback(userId) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isBanned: true },
    });
}
/** Chargeback (status=2): debit the user's BLK, floored at 0, inside a single transaction. */
export async function createChargebackCallback(params) {
    await prisma.$transaction(async (tx) => {
        await tx.offerwallMeCallback.create({
            data: {
                userId: params.userId,
                transId: params.transId,
                offerName: params.offerName,
                offerType: params.offerType,
                payoutUsd: params.payoutUsd,
                // Column historically pol_credited — now stores BLK (signed for chargeback).
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
        const after = await tx.user.findUnique({ where: { id: params.userId }, select: { blkBalance: true } });
        if (after && after.blkBalance.lessThan(0)) {
            await tx.user.update({ where: { id: params.userId }, data: { blkBalance: new Prisma.Decimal(0) } });
        }
    });
}
/** Credit (status!=2): credit the user's BLK inside a single transaction. */
export async function createCreditCallback(params) {
    return prisma.$transaction(async (tx) => {
        const created = await tx.offerwallMeCallback.create({
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
export async function listCallbackHistory(userId, skip, take) {
    const [entries, total] = await Promise.all([
        prisma.offerwallMeCallback.findMany({
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
        prisma.offerwallMeCallback.count({ where: { userId, status: 1 } }),
    ]);
    return { entries, total };
}
export async function getStatsAggregates(userId, startOfDay, startOfWeek, startOfMonth) {
    const [agg, offersToday, offersWeek, offersMonth] = await Promise.all([
        prisma.offerwallMeCallback.aggregate({
            where: { userId, status: 1 },
            _sum: { payoutUsd: true, polCredited: true },
            _count: { id: true },
        }),
        prisma.offerwallMeCallback.count({ where: { userId, status: 1, createdAt: { gte: startOfDay } } }),
        prisma.offerwallMeCallback.count({ where: { userId, status: 1, createdAt: { gte: startOfWeek } } }),
        prisma.offerwallMeCallback.count({ where: { userId, status: 1, createdAt: { gte: startOfMonth } } }),
    ]);
    return { agg, offersToday, offersWeek, offersMonth };
}
