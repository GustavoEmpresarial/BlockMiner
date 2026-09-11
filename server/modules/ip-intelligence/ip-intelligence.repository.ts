/** Prisma access for the IpIntelligenceCache model. Kept thin per doctrine — no query logic here beyond passthrough. */
import type { IpIntelligenceCache } from "@prisma/client";
import type { AppPrisma } from "../../core/database/prisma.js";
import { PROXYCHECK_SOURCE } from "./ip-intelligence.config.js";

export async function findCachedIp(prisma: AppPrisma, ip: string): Promise<IpIntelligenceCache | null> {
  if (!prisma?.ipIntelligenceCache?.findUnique) return null;
  return prisma.ipIntelligenceCache.findUnique({ where: { ip } }).catch(() => null);
}

export async function upsertCachedIp(
  prisma: AppPrisma,
  ip: string,
  data: Omit<IpIntelligenceCache, "id" | "createdAt" | "updatedAt">,
): Promise<void> {
  if (!prisma?.ipIntelligenceCache) return;
  await prisma.ipIntelligenceCache.upsert({ where: { ip }, create: data, update: data });
}

export async function countProxycheckUsedToday(prisma: AppPrisma, sinceUtcMidnight: Date): Promise<number> {
  return countProxyUsedTodayBySource(prisma, PROXYCHECK_SOURCE, sinceUtcMidnight);
}

export async function countProxyUsedTodayBySource(
  prisma: AppPrisma,
  source: string,
  sinceUtcMidnight: Date,
): Promise<number> {
  if (!prisma?.ipIntelligenceCache?.count) return 0;
  return prisma.ipIntelligenceCache
    .count({
      where: {
        proxyCheckedAt: { gte: sinceUtcMidnight },
        proxySource: { contains: source },
      },
    })
    .catch(() => 0);
}
