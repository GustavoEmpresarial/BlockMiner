import prisma from "../../core/database/prisma.js";
import { attachFanBonus, rankingUserSelect } from "./ranking.hashrate.js";

export async function listRankableUsers(now: Date, includeAutoMiningV2: boolean) {
  const users = await prisma.user.findMany({
    where: { isBanned: false },
    select: rankingUserSelect(now, { includeAutoMiningV2 }),
  });
  return attachFanBonus(users);
}

export async function findUserRoomProfile(username: string, now: Date) {
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
