import prisma from "../../core/database/prisma.js";
export async function getAdminOverviewAggregates() {
    const [totalAdmins, activeAdmins, activeSessions, recentLogs] = await Promise.all([
        prisma.adminUser.count(),
        prisma.adminUser.count({ where: { isActive: true } }),
        prisma.adminSession.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
        prisma.adminAuditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 10,
            include: { admin: { select: { name: true, email: true } } },
        }),
    ]);
    return { totalAdmins, activeAdmins, activeSessions, recentLogs };
}
