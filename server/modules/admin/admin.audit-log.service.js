import prisma from "../../core/database/prisma.js";
export async function logAdminAction(opts) {
    await prisma.adminAuditLog
        .create({
        data: {
            adminId: opts.adminId ?? null,
            adminEmail: opts.adminEmail ?? null,
            sessionId: opts.sessionId ?? null,
            action: opts.action,
            module: opts.module ?? null,
            resource: opts.resource ?? null,
            resourceId: opts.resourceId ? String(opts.resourceId) : null,
            oldValue: opts.oldValue !== undefined ? opts.oldValue : undefined,
            newValue: opts.newValue !== undefined ? opts.newValue : undefined,
            ipAddress: opts.ipAddress ?? null,
            userAgent: opts.userAgent ?? null,
            success: opts.success ?? true,
            errorMsg: opts.errorMsg ?? null,
            durationMs: opts.durationMs ?? null,
        },
    })
        .catch(() => undefined); // best-effort, never throws
}
export async function queryAdminAuditLogs(opts) {
    const { page = 1, pageSize = 50 } = opts;
    const where = {
        ...(opts.adminId != null ? { adminId: opts.adminId } : {}),
        ...(opts.action ? { action: { contains: opts.action, mode: "insensitive" } } : {}),
        ...(opts.module ? { module: opts.module } : {}),
        ...(opts.success != null ? { success: opts.success } : {}),
        ...(opts.from || opts.to
            ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
            : {}),
    };
    const [rows, total] = await Promise.all([
        prisma.adminAuditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { admin: { select: { name: true, email: true } } },
        }),
        prisma.adminAuditLog.count({ where }),
    ]);
    return { rows: rows.map(serializeAuditRow), total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
/** AdminAuditLog.id is a BigInt — res.json → JSON.stringify cannot serialise it. */
export function serializeAuditRow(row) {
    return { ...row, id: row.id.toString() };
}
