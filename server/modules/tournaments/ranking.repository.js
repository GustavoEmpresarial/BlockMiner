import prisma from "../../core/database/prisma.js";
import { rankingUserSelect } from "./ranking.hashrate.js";
export async function listRankableUsers(now, includeAutoMiningV2) {
    return prisma.user.findMany({
        where: { isBanned: false },
        select: rankingUserSelect(now, { includeAutoMiningV2 }),
    });
}
export async function findUserRoomProfile(username, now) {
    return prisma.user.findFirst({
        where: { username },
        select: {
            id: true,
            username: true,
            miners: {
                where: { isActive: true },
                select: {
                    id: true,
                    hashRate: true,
                    slotIndex: true,
                    imageUrl: true,
                    level: true,
                    slotSize: true,
                    miner: { select: { name: true } },
                },
            },
            gamePowers: {
                where: { expiresAt: { gt: now } },
                select: { hashRate: true },
            },
            ytPowers: {
                where: { expiresAt: { gt: now } },
                select: { hashRate: true },
            },
            gpuAccess: {
                where: { isClaimed: true, expiresAt: { gt: now } },
                select: { gpuHashRate: true },
            },
            rackConfigs: {
                select: { rackIndex: true, customName: true },
            },
            userRooms: {
                select: { roomNumber: true },
            },
        },
    });
}
