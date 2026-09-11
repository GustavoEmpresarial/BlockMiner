/** Ported from legacy/server/modules/games/infrastructure/repositories/gamesPower.repository.ts. */
import prisma from "../../core/database/prisma.js";

export async function listActiveGamePowers(userId: number, now: Date) {
  return prisma.userPowerGame.findMany({
    where: { userId, expiresAt: { gt: now } },
    include: { game: { select: { id: true, name: true, slug: true } } },
  });
}

export async function aggregateActiveMinerHashRate(userId: number) {
  return prisma.userMiner.aggregate({ where: { userId, isActive: true }, _sum: { hashRate: true } });
}
