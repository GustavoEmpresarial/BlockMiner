import { PROXYCHECK_SOURCE } from "./ip-intelligence.config.js";
export async function findCachedIp(prisma, ip) {
    if (!prisma?.ipIntelligenceCache?.findUnique)
        return null;
    return prisma.ipIntelligenceCache.findUnique({ where: { ip } }).catch(() => null);
}
export async function upsertCachedIp(prisma, ip, data) {
    if (!prisma?.ipIntelligenceCache)
        return;
    await prisma.ipIntelligenceCache.upsert({ where: { ip }, create: data, update: data });
}
export async function countProxycheckUsedToday(prisma, sinceUtcMidnight) {
    return countProxyUsedTodayBySource(prisma, PROXYCHECK_SOURCE, sinceUtcMidnight);
}
export async function countProxyUsedTodayBySource(prisma, source, sinceUtcMidnight) {
    if (!prisma?.ipIntelligenceCache?.count)
        return 0;
    return prisma.ipIntelligenceCache
        .count({
        where: {
            proxyCheckedAt: { gte: sinceUtcMidnight },
            proxySource: { contains: source },
        },
    })
        .catch(() => 0);
}
