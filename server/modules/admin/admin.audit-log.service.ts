import prisma from "../../core/database/prisma.js";

export interface LogAdminActionOpts {
  adminId?: number | null;
  adminEmail?: string | null;
  sessionId?: string | null;
  action: string;
  module?: string | null;
  resource?: string | null;
  resourceId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  success?: boolean;
  errorMsg?: string | null;
  durationMs?: number | null;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "jwt",
  "secret",
  "privatekey",
  "mnemonic",
  "seed",
  "authorization",
  "creditcard",
  "cardnumber",
  "cvv",
]);

function isSensitiveKey(lowerKey: string): boolean {
  if (SENSITIVE_KEYS.has(lowerKey)) return true;
  return (
    lowerKey.includes("password") ||
    lowerKey.includes("token") ||
    lowerKey.includes("secret") ||
    lowerKey.includes("mnemonic") ||
    lowerKey.includes("privatekey")
  );
}

export function sanitizeAuditPayload(val: unknown, depth = 0): unknown {
  if (depth > 4 || val == null) return val;
  if (typeof val !== "object") return val;
  if (typeof (val as { toJSON?: () => unknown }).toJSON === "function") {
    return (val as { toJSON: () => unknown }).toJSON();
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeAuditPayload(item, depth + 1));
  }
  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    const lowerKey = k.toLowerCase().replace(/[-_]/g, "");
    if (isSensitiveKey(lowerKey)) {
      sanitized[k] = "[REDACTED]";
    } else if (typeof v === "object" && v !== null) {
      sanitized[k] = sanitizeAuditPayload(v, depth + 1);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

function truncateStr(s: unknown, maxLen: number): string | null {
  if (s == null) return null;
  const str = String(s).trim();
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

export async function logAdminAction(opts: LogAdminActionOpts): Promise<void> {
  const sanitizedOld = opts.oldValue !== undefined ? sanitizeAuditPayload(opts.oldValue) : undefined;
  const sanitizedNew = opts.newValue !== undefined ? sanitizeAuditPayload(opts.newValue) : undefined;

  await prisma.adminAuditLog
    .create({
      data: {
        adminId: opts.adminId ?? null,
        adminEmail: truncateStr(opts.adminEmail, 255),
        sessionId: truncateStr(opts.sessionId, 128),
        action: truncateStr(opts.action, 100) || "UNKNOWN_ACTION",
        module: truncateStr(opts.module, 50),
        resource: truncateStr(opts.resource, 100),
        resourceId: opts.resourceId ? truncateStr(opts.resourceId, 128) : null,
        oldValue: sanitizedOld !== undefined ? (sanitizedOld as object) : undefined,
        newValue: sanitizedNew !== undefined ? (sanitizedNew as object) : undefined,
        ipAddress: truncateStr(opts.ipAddress, 64),
        userAgent: truncateStr(opts.userAgent, 500),
        success: opts.success ?? true,
        errorMsg: truncateStr(opts.errorMsg, 500),
        durationMs: opts.durationMs ?? null,
      },
    })
    .catch(() => undefined); // best-effort, never throws
}

export async function queryAdminAuditLogs(opts: {
  adminId?: number;
  action?: string;
  module?: string;
  success?: boolean;
  search?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}) {
  const { page = 1, pageSize = 50 } = opts;
  const where: Record<string, unknown> = {
    ...(opts.adminId != null ? { adminId: opts.adminId } : {}),
    ...(opts.action ? { action: { contains: opts.action, mode: "insensitive" as const } } : {}),
    ...(opts.module ? { module: opts.module } : {}),
    ...(opts.success != null ? { success: opts.success } : {}),
    ...(opts.from || opts.to
      ? { createdAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
      : {}),
  };

  if (opts.search && opts.search.trim()) {
    const q = opts.search.trim();
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { module: { contains: q, mode: "insensitive" } },
      { adminEmail: { contains: q, mode: "insensitive" } },
      { resource: { contains: q, mode: "insensitive" } },
      { resourceId: { contains: q, mode: "insensitive" } },
      { ipAddress: { contains: q, mode: "insensitive" } },
      { errorMsg: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { admin: { select: { id: true, name: true, email: true, role: true } } },
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return { rows: rows.map(serializeAuditRow), total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

let cachedStats: { data: Record<string, unknown>; timestamp: number } | null = null;
const STATS_CACHE_TTL_MS = 5_000;

export async function getAdminAuditStats() {
  const now = Date.now();
  if (cachedStats && now - cachedStats.timestamp < STATS_CACHE_TTL_MS) {
    return cachedStats.data;
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [total, successCount, failedCount, last24hCount, last7dCount, actionsGroup, modulesGroup, admins] = await Promise.all([
    prisma.adminAuditLog.count(),
    prisma.adminAuditLog.count({ where: { success: true } }),
    prisma.adminAuditLog.count({ where: { success: false } }),
    prisma.adminAuditLog.count({ where: { createdAt: { gte: oneDayAgo } } }),
    prisma.adminAuditLog.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.adminAuditLog.groupBy({
      by: ["action"],
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
      take: 8,
    }),
    prisma.adminAuditLog.groupBy({
      by: ["module"],
      _count: { module: true },
      orderBy: { _count: { module: "desc" } },
    }),
    prisma.adminUser.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const topActions = actionsGroup.map((g) => ({
    action: g.action,
    count: g._count.action,
  }));

  const modulesBreakdown = modulesGroup.map((g) => ({
    module: g.module || "other",
    count: g._count.module,
  }));

  const result = {
    total,
    successCount,
    failedCount,
    last24hCount,
    last7dCount,
    successRate: total > 0 ? Math.round((successCount / total) * 100) : 100,
    topActions,
    modulesBreakdown,
    admins,
  };

  cachedStats = { data: result, timestamp: now };
  return result;
}

/** AdminAuditLog.id is a BigInt — res.json → JSON.stringify cannot serialise it. */
export function serializeAuditRow<T extends { id: bigint }>(row: T): Omit<T, "id"> & { id: string } {
  return { ...row, id: row.id.toString() };
}
