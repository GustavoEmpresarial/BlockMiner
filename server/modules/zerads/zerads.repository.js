import prisma from "../../core/database/prisma.js";
export async function findUserByUsernameForCallback(username) {
    return prisma.user.findUnique({
        where: { username },
        select: { id: true, isBanned: true, username: true },
    });
}
export async function sumClicksInWindow(userId, start, end) {
    return prisma.zeradsCallback.aggregate({
        where: { userId, callbackAt: { gte: start, lt: end } },
        _sum: { clicks: true },
    });
}
export async function createCallbackAndCreditBalance(data) {
    const clicks = Math.max(0, Math.trunc(data.creditedClicks));
    if (clicks <= 0)
        return;
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
export async function findUsernameById(userId) {
    return prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
}
export async function listCallbackHistory(userId, skip, take) {
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
export async function getStatsAggregates(userId, startOfDay, startOfWeek, startOfMonth) {
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
