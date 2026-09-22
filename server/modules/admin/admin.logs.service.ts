/**
 * Service layer for AuditLog (system and user activity logs).
 * Provides sanitized querying, aggregations, and CSV/JSON export.
 */
import prisma from "../../core/database/prisma.js";
import type { Prisma } from "@prisma/client";

export interface AuditLogQueryParams {
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
  source?: string;
  severity?: string;
  action?: string;
  userId?: number;
  q?: string;
  from?: string;
  to?: string;
}

export interface SerializedAuditLogRow {
  id: number;
  userId: number | null;
  user_id: number | null;
  user_email: string | null;
  user: { email: string | null; username: string | null } | null;
  action: string;
  label: string | null;
  description: string | null;
  source: string;
  severity: string;
  ip: string | null;
  userAgent: string | null;
  detailsJson: unknown;
  metadata: unknown;
  actorAdminId: number | null;
  createdAt: Date;
  created_at: Date;
}

export interface AuditLogsQueryResult {
  ok: true;
  logs: SerializedAuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  sourcesSummary: { source: string; count: number }[];
  severitiesSummary: { severity: string; count: number }[];
}

/**
 * Builds a sanitized, type-safe Prisma WHERE clause for AuditLog.
 */
export function buildAuditLogWhereClause(params: AuditLogQueryParams): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  // 1. Source filter
  if (params.source && params.source.trim() !== "" && params.source !== "all") {
    const src = params.source.trim().toLowerCase();
    where.source = src;
  }

  // 2. Severity filter
  if (params.severity && params.severity.trim() !== "" && params.severity !== "all") {
    const sev = params.severity.trim().toLowerCase();
    where.severity = sev;
  }

  // 3. Action filter
  if (params.action && params.action.trim() !== "") {
    const action = params.action.trim().slice(0, 100);
    where.action = { contains: action, mode: "insensitive" };
  }

  // 4. User ID filter
  const uid = Number(params.userId);
  if (Number.isSafeInteger(uid) && uid > 0) {
    where.userId = uid;
  }

  // 5. Date range (from / to)
  const dateFilter: Prisma.DateTimeFilter = {};
  let hasDateFilter = false;

  if (params.from) {
    const fromDate = new Date(params.from);
    if (!isNaN(fromDate.getTime())) {
      dateFilter.gte = fromDate;
      hasDateFilter = true;
    }
  }

  if (params.to) {
    const toDate = new Date(params.to);
    if (!isNaN(toDate.getTime())) {
      dateFilter.lte = toDate;
      hasDateFilter = true;
    }
  }

  if (hasDateFilter) {
    where.createdAt = dateFilter;
  }

  // 6. Full-text search (q)
  if (params.q && params.q.trim() !== "") {
    const q = params.q.trim().slice(0, 200);
    where.OR = [
      { action: { contains: q, mode: "insensitive" } },
      { label: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { ip: { contains: q, mode: "insensitive" } },
      { userAgent: { contains: q, mode: "insensitive" } },
      { user: { email: { contains: q, mode: "insensitive" } } },
      { user: { username: { contains: q, mode: "insensitive" } } },
    ];
  }

  return where;
}

/**
 * Normalizes pagination params from either page/pageSize or limit/offset.
 */
export function normalizePagination(params: {
  page?: number | string;
  pageSize?: number | string;
  limit?: number | string;
  offset?: number | string;
}): { page: number; pageSize: number; skip: number; take: number } {
  let pageSize = 50;
  if (params.pageSize != null) {
    pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 50));
  } else if (params.limit != null) {
    pageSize = Math.min(100, Math.max(1, Number(params.limit) || 50));
  }

  let page = 1;
  let skip = 0;

  if (params.offset != null) {
    const offsetNum = Math.max(0, Number(params.offset) || 0);
    skip = offsetNum;
    page = Math.floor(offsetNum / pageSize) + 1;
  } else {
    page = Math.max(1, Number(params.page) || 1);
    skip = (page - 1) * pageSize;
  }

  return { page, pageSize, skip, take: pageSize };
}

/**
 * Executes paginated query for AuditLog, along with summaries of sources and severities.
 */
export async function queryAuditLogs(params: AuditLogQueryParams): Promise<AuditLogsQueryResult> {
  const where = buildAuditLogWhereClause(params);
  const { page, pageSize, skip, take } = normalizePagination(params);

  const [rawLogs, total, rawSources, rawSeverities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        userId: true,
        action: true,
        label: true,
        description: true,
        source: true,
        severity: true,
        ip: true,
        userAgent: true,
        metadata: true,
        detailsJson: true,
        actorAdminId: true,
        createdAt: true,
        user: { select: { email: true, username: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({
      by: ["source"],
      _count: { source: true },
    }).catch(() => []),
    prisma.auditLog.groupBy({
      by: ["severity"],
      _count: { severity: true },
    }).catch(() => []),
  ]);

  const logs: SerializedAuditLogRow[] = rawLogs.map((row) => ({
    id: row.id,
    userId: row.userId,
    user_id: row.userId,
    user_email: row.user?.email ?? null,
    user: row.user,
    action: row.action,
    label: row.label,
    description: row.description,
    source: row.source,
    severity: row.severity,
    ip: row.ip,
    userAgent: row.userAgent,
    detailsJson: row.detailsJson,
    metadata: row.metadata,
    actorAdminId: row.actorAdminId,
    createdAt: row.createdAt,
    created_at: row.createdAt,
  }));

  const sourcesSummary = rawSources.map((s) => ({
    source: s.source,
    count: s._count?.source ?? 0,
  }));

  const severitiesSummary = rawSeverities.map((s) => ({
    severity: s.severity,
    count: s._count?.severity ?? 0,
  }));

  return {
    ok: true,
    logs,
    total,
    page,
    pageSize,
    hasMore: skip + logs.length < total,
    sourcesSummary,
    severitiesSummary,
  };
}

/**
 * Retrieves a single audit log row by ID.
 */
export async function getAuditLogById(id: number) {
  return prisma.auditLog.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, username: true } } },
  });
}

/**
 * Escapes a cell for CSV formatting adhering to RFC 4180.
 */
function escapeCsvCell(val: unknown): string {
  if (val == null) return '""';
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Exports audit logs matching filters up to maxLimit (default 5,000).
 */
export async function exportAuditLogs(
  params: AuditLogQueryParams,
  format: "csv" | "json" = "csv",
  maxLimit = 5000
): Promise<{ contentType: string; data: string; filename: string; count: number }> {
  const where = buildAuditLogWhereClause(params);
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(maxLimit, 5000),
    select: {
      id: true,
      userId: true,
      action: true,
      label: true,
      description: true,
      source: true,
      severity: true,
      ip: true,
      userAgent: true,
      metadata: true,
      detailsJson: true,
      actorAdminId: true,
      createdAt: true,
      user: { select: { email: true, username: true } },
    },
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (format === "json") {
    const serialized = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.user?.email ?? null,
      username: r.user?.username ?? null,
      action: r.action,
      label: r.label,
      description: r.description,
      source: r.source,
      severity: r.severity,
      ip: r.ip,
      userAgent: r.userAgent,
      metadata: r.metadata,
      detailsJson: r.detailsJson,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      contentType: "application/json; charset=utf-8",
      data: JSON.stringify({ ok: true, count: rows.length, exportedAt: new Date().toISOString(), logs: serialized }, null, 2),
      filename: `system-logs-${timestamp}.json`,
      count: rows.length,
    };
  }

  // CSV format
  const headers = [
    "ID",
    "Created At",
    "Source",
    "Severity",
    "Action",
    "Label",
    "User ID",
    "User Email",
    "Username",
    "IP Address",
    "User Agent",
    "Description",
    "Details",
  ];

  const lines = [headers.join(",")];

  for (const r of rows) {
    const line = [
      escapeCsvCell(r.id),
      escapeCsvCell(r.createdAt.toISOString()),
      escapeCsvCell(r.source),
      escapeCsvCell(r.severity),
      escapeCsvCell(r.action),
      escapeCsvCell(r.label),
      escapeCsvCell(r.userId),
      escapeCsvCell(r.user?.email),
      escapeCsvCell(r.user?.username),
      escapeCsvCell(r.ip),
      escapeCsvCell(r.userAgent),
      escapeCsvCell(r.description),
      escapeCsvCell(r.detailsJson || (r.metadata ? JSON.stringify(r.metadata) : "")),
    ];
    lines.push(line.join(","));
  }

  return {
    contentType: "text/csv; charset=utf-8",
    data: lines.join("\r\n"),
    filename: `system-logs-${timestamp}.csv`,
    count: rows.length,
  };
}
