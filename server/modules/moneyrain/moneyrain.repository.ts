// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import prisma from "../../core/database/prisma.js";
export async function findUserForCallback(userId) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, isBanned: true },
    });
}
/**
 * Single transaction: create the MoneyRainCallback row (unique on `viewId` — the DB
 * constraint is the idempotency guard, caller catches the P2002/unique-violation to
 * treat a replayed callback as a no-op) and credit the user's POL balance. Per-view
 * crediting, not a shared pot — no advisory locks needed here (see module header).
 */
export async function createCallbackAndCreditBalance(data) {
    await prisma.$transaction([
        prisma.moneyRainCallback.create({
            data: {
                userId: data.userId,
                viewId: data.viewId,
                campaignId: data.campaignId,
                adType: data.adType,
                site: data.site,
                rewardUsdt: data.rewardUsdt,
                // Column historically pol_credited — now stores BLK credited.
                polCredited: Number(data.blkToCredit),
                polPrice: data.polPrice,
                nonce: data.nonce,
                requestIp: data.clientIp,
            },
        }),
        prisma.user.update({
            where: { id: data.userId },
            data: { blkBalance: { increment: data.blkToCredit } },
        }),
    ]);
}
export async function listCallbackHistory(userId, skip, take) {
    const [entries, total] = await Promise.all([
        prisma.moneyRainCallback.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            skip,
            take,
            select: {
                id: true,
                adType: true,
                rewardUsdt: true,
                polCredited: true,
                createdAt: true,
            },
        }),
        prisma.moneyRainCallback.count({ where: { userId } }),
    ]);
    return { entries, total };
}
export async function getStatsAggregates(userId, startOfDay, startOfWeek, startOfMonth) {
    const [agg, offersToday, offersWeek, offersMonth] = await Promise.all([
        prisma.moneyRainCallback.aggregate({
            where: { userId },
            _sum: { rewardUsdt: true, polCredited: true },
            _count: { id: true },
        }),
        prisma.moneyRainCallback.count({ where: { userId, createdAt: { gte: startOfDay } } }),
        prisma.moneyRainCallback.count({ where: { userId, createdAt: { gte: startOfWeek } } }),
        prisma.moneyRainCallback.count({ where: { userId, createdAt: { gte: startOfMonth } } }),
    ]);
    return { agg, offersToday, offersWeek, offersMonth };
}
