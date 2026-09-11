/** Ported from legacy/server/models/rackModel.ts. Prisma model: `RackConfig` (@@map "rack_configs"). */
import prisma from "../../../core/database/prisma.js";

export async function listRacks(userId: number) {
  return prisma.rackConfig.findMany({
    where: { userId },
    orderBy: { rackIndex: "asc" },
    select: { rackIndex: true, customName: true },
  });
}

export async function upsertRackName(userId: number, rackIndex: number, customName: string) {
  return prisma.rackConfig.upsert({
    where: { userId_rackIndex: { userId, rackIndex } },
    update: { customName, updatedAt: new Date() },
    create: { userId, rackIndex, customName },
  });
}
