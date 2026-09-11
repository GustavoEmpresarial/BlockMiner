/**
 * Auto Mining — Prisma data access layer (v1 GPU + admin rewards CRUD).
 * All queries live here; no business logic. V2 session/grant/banner queries live inline in
 * auto-mining.v2.service.ts (matches legacy, which never split v2 into its own repository file).
 * Ported 1:1 from legacy/server/modules/auto-mining/infrastructure/repositories/auto-mining.repository.ts.
 */
import prisma from "../../core/database/prisma.js";
export async function findAvailableGPUs(userId) {
    return prisma.autoMiningGpu.findMany({
        where: { userId, isClaimed: false, isAvailable: true },
        include: { reward: true },
    });
}
export async function findLastReleasedGPU(userId) {
    return prisma.autoMiningGpu.findFirst({
        where: { userId },
        orderBy: { releasedAt: "desc" },
    });
}
export async function findUserSecondsBalance(userId) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { autoMiningSecondsBalance: true },
    });
}
export async function findActiveReward() {
    return prisma.autoMiningReward.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
    });
}
export async function findAnyReward() {
    return prisma.autoMiningReward.findFirst();
}
export async function createGPU(userId, rewardId, gpuHashRate, releasedAt) {
    return prisma.autoMiningGpu.create({
        data: { userId, rewardId, gpuHashRate, isAvailable: true, isClaimed: false, releasedAt },
        include: { reward: true },
    });
}
export async function findGPUForClaim(gpuId, userId) {
    return prisma.autoMiningGpu.findFirst({
        where: { id: gpuId, userId, isClaimed: false },
    });
}
export async function findGPUWithReward(gpuId) {
    return prisma.autoMiningGpu.findUnique({
        where: { id: gpuId },
        include: { reward: true },
    });
}
export async function countClaimsLast24h(userId, since) {
    return prisma.autoMiningGpu.count({
        where: { userId, isClaimed: true, claimedAt: { gt: since } },
    });
}
export async function sumHashRateLast24h(userId, since) {
    return prisma.autoMiningGpu.aggregate({
        where: { userId, isClaimed: true, claimedAt: { gt: since } },
        _sum: { gpuHashRate: true },
    });
}
export async function aggregateTotalStats(userId) {
    return prisma.autoMiningGpu.aggregate({
        where: { userId, isClaimed: true },
        _count: true,
        _sum: { gpuHashRate: true },
    });
}
export async function claimGPUTx(tx, gpuId, claimedAt, expiresAt) {
    return tx.autoMiningGpu.update({
        where: { id: gpuId },
        data: { isClaimed: true, claimedAt, expiresAt },
    });
}
export async function decrementSecondsBalanceTx(tx, userId, amount) {
    return tx.user.update({
        where: { id: userId },
        data: { autoMiningSecondsBalance: { decrement: amount } },
    });
}
export async function createGPULogTx(tx, data) {
    return tx.autoMiningGpuLog.create({ data });
}
export async function findGPUHistory(userId, limit = 20) {
    return prisma.autoMiningGpuLog.findMany({
        where: { userId },
        orderBy: { claimedAt: "desc" },
        take: limit,
        include: { reward: true },
    });
}
export async function removeExpiredGPUs() {
    const now = new Date();
    const expired = await prisma.autoMiningGpu.findMany({
        where: { isClaimed: true, expiresAt: { lt: now } },
        select: { id: true },
    });
    if (expired.length === 0)
        return 0;
    const ids = expired.map((e) => e.id);
    await prisma.$transaction(async (tx) => {
        await tx.autoMiningGpuLog.deleteMany({ where: { gpuId: { in: ids } } });
        await tx.autoMiningGpu.deleteMany({ where: { id: { in: ids } } });
    });
    return ids.length;
}
// Admin queries
export async function adminFindAllRewards() {
    return prisma.autoMiningReward.findMany();
}
export async function adminFindActiveRewards() {
    return prisma.autoMiningReward.findMany({ where: { isActive: true } });
}
export async function adminFindRewardById(id) {
    return prisma.autoMiningReward.findUnique({ where: { id } });
}
export async function adminCreateReward(data) {
    return prisma.autoMiningReward.create({ data });
}
export async function adminUpdateReward(id, data) {
    return prisma.autoMiningReward.update({ where: { id }, data });
}
export async function adminDeleteReward(id) {
    return prisma.autoMiningReward.delete({ where: { id } });
}
export async function adminCountRewards() {
    const [total, active] = await Promise.all([
        prisma.autoMiningReward.count(),
        prisma.autoMiningReward.count({ where: { isActive: true } }),
    ]);
    return { total, active };
}
export async function adminGetReleasedGPUs(limit = 50, offset = 0) {
    const rows = await prisma.autoMiningGpu.findMany({
        take: limit,
        skip: offset,
        orderBy: { releasedAt: "desc" },
        include: {
            user: { select: { username: true } },
            reward: { select: { name: true } },
        },
    });
    return rows.map((g) => ({
        id: g.id,
        username: g.user.username,
        name: g.reward?.name ?? null,
        gpu_hash_rate: g.gpuHashRate,
        is_available: g.isAvailable ? 1 : 0,
        is_claimed: g.isClaimed ? 1 : 0,
    }));
}
export async function adminGetGPUReport() {
    const [releasedAgg, claimedAgg, pendingAgg, usersWith] = await Promise.all([
        prisma.autoMiningGpu.aggregate({ _count: true, _sum: { gpuHashRate: true } }),
        prisma.autoMiningGpu.aggregate({ where: { isClaimed: true }, _count: true, _sum: { gpuHashRate: true } }),
        prisma.autoMiningGpu.aggregate({ where: { isClaimed: false, isAvailable: true }, _count: true, _sum: { gpuHashRate: true } }),
        prisma.autoMiningGpu.groupBy({ by: ["userId"], _count: true }),
    ]);
    return {
        total_released: releasedAgg._count,
        total_hash_rate_released: Number(releasedAgg._sum.gpuHashRate || 0),
        total_claimed: claimedAgg._count,
        total_claimed_hash_rate: Number(claimedAgg._sum.gpuHashRate || 0),
        total_pending: pendingAgg._count,
        total_pending_hash_rate: Number(pendingAgg._sum.gpuHashRate || 0),
        users_with_gpu: usersWith.length,
    };
}
