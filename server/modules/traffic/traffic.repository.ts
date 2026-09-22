/** Ported from legacy/server/modules/traffic/infrastructure/repositories/traffic.repository.ts. */
import { Prisma } from "@prisma/client";
import prisma from "../../core/database/prisma.js";
import type {
  ClientErrorListItem,
  ClientErrorReportInput,
  RecordPageViewInput,
  TrafficByDomainRow,
  TrafficByUtmRow,
  TrafficDailyRow,
  TrafficSummary,
} from "./traffic.types.js";
import { CLIENT_ERROR_ACTIONS } from "./traffic.errors.js";

export async function recordPageView(data: RecordPageViewInput): Promise<void> {
  await prisma.pageView.create({ data });
}

export async function getTrafficSummary(days = 30): Promise<TrafficSummary> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [totalHits, periodHits, totalRegs, periodRegs] = await Promise.all([
    prisma.pageView.count(),
    prisma.pageView.count({ where: { createdAt: { gte: since } } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since } } }),
  ]);

  return {
    totalHits,
    periodHits,
    totalRegs,
    periodRegs,
    // Raw regs/hits ratio — NOT a funnel conversion (hits are landing-only).
    conversionRate: periodHits > 0 ? (periodRegs / periodHits) * 100 : null,
    days,
  };
}

export async function getTrafficByDomain(days = 30): Promise<TrafficByDomainRow[]> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [hits, regs] = await Promise.all([
    prisma.pageView.groupBy({
      by: ["referrerDomain"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 50,
    }),
    prisma.user.groupBy({
      by: ["referrerDomain"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    }),
  ]);

  const regMap = new Map<string, number>();
  for (const r of regs) {
    regMap.set(r.referrerDomain ?? "direct", r._count.id);
  }

  return hits.map((h) => {
    const domain = h.referrerDomain ?? "direct";
    const hitsCount = h._count.id;
    const regCount = regMap.get(domain) ?? 0;
    return {
      domain,
      hits: hitsCount,
      registrations: regCount,
      conversionRate: hitsCount > 0 ? (regCount / hitsCount) * 100 : 0,
    };
  });
}

export async function getTrafficByUtm(days = 30): Promise<TrafficByUtmRow[]> {
  const since = new Date(Date.now() - days * 86_400_000);

  const [hits, regs] = await Promise.all([
    prisma.pageView.groupBy({
      by: ["utmSource"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 50,
    }),
    prisma.user.groupBy({
      by: ["utmSource"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    }),
  ]);

  const regMap = new Map<string, number>();
  for (const r of regs) {
    regMap.set(r.utmSource ?? "(none)", r._count.id);
  }

  return hits.map((h) => {
    const source = h.utmSource ?? "(none)";
    const hitsCount = h._count.id;
    const regCount = regMap.get(source) ?? 0;
    return {
      source,
      hits: hitsCount,
      registrations: regCount,
      conversionRate: hitsCount > 0 ? (regCount / hitsCount) * 100 : 0,
    };
  });
}

export async function getTrafficDaily(days = 30): Promise<TrafficDailyRow[]> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT
       TO_CHAR(d.day::date, 'YYYY-MM-DD') AS date,
       COALESCE(h.hits, 0)::text           AS hits,
       COALESCE(r.regs, 0)::text           AS registrations
     FROM generate_series(
       (NOW() - INTERVAL '${days} days')::date,
       NOW()::date,
       '1 day'::interval
     ) AS d(day)
     LEFT JOIN (
       SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS hits
       FROM page_views
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY 1
     ) h ON h.day = d.day::date
     LEFT JOIN (
       SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS regs
       FROM users
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY 1
     ) r ON r.day = d.day::date
     ORDER BY d.day`,
  )) as Array<{ date: string; hits: string; registrations: string }>;
  return rows.map((r) => ({
    date: r.date,
    hits: Number(r.hits),
    registrations: Number(r.registrations),
  }));
}

/** Ported from clientErrors.admin.routes.ts + the AuditLog.create() in traffic.routes.ts. */
export async function createClientErrorLog(input: ClientErrorReportInput): Promise<void> {
  const action = input.category === "api_failure" ? "client_api_failure" : "client_error_report";
  await prisma.auditLog.create({
    data: {
      action,
      source: "client",
      userId: input.userId,
      severity: input.category === "api_failure" ? "warning" : "error",
      label: input.message.slice(0, 200) || "(empty)",
      description: input.stack || input.componentStack || null,
      ip: input.ip || null,
      userAgent: input.userAgent || null,
      metadata: {
        category: input.category,
        url: input.url,
        stack: input.stack,
        componentStack: input.componentStack,
        buildId: input.buildId,
        statusCode: input.statusCode,
        code: input.code,
        operation: input.operation,
        requestId: input.requestId,
        fingerprint: input.fingerprint || null,
        breadcrumbs: input.breadcrumbs || null,
        environment: input.environment || null,
      },
    },
  });
}

export type ClientErrorListOptions = {
  limit?: number;
  offset?: number;
  category?: "crash" | "api_failure";
  search?: string;
};

export async function listClientErrors(optsOrLimit?: number | ClientErrorListOptions): Promise<ClientErrorListItem[]> {
  const opts: ClientErrorListOptions = typeof optsOrLimit === "number" ? { limit: optsOrLimit } : (optsOrLimit ?? {});
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 1000);
  const offset = Math.max(opts.offset ?? 0, 0);

  const where: Prisma.AuditLogWhereInput = {
    action: opts.category
      ? opts.category === "api_failure"
        ? "client_api_failure"
        : "client_error_report"
      : { in: [...CLIENT_ERROR_ACTIONS] },
  };

  if (opts.search && typeof opts.search === "string" && opts.search.trim()) {
    const s = opts.search.trim();
    where.OR = [
      { label: { contains: s, mode: "insensitive" } },
      { description: { contains: s, mode: "insensitive" } },
      { ip: { contains: s } },
      { userAgent: { contains: s, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    select: {
      id: true,
      action: true,
      severity: true,
      label: true,
      description: true,
      ip: true,
      userAgent: true,
      metadata: true,
      createdAt: true,
      userId: true,
      user: { select: { id: true, name: true } },
    },
  });
  return rows.map(({ user, ...row }) => ({
    ...row,
    user: user ? { id: user.id, name: user.name } : null,
  }));
}

export async function clearClientErrors(): Promise<number> {
  const r = await prisma.auditLog.deleteMany({
    where: { action: { in: [...CLIENT_ERROR_ACTIONS] } },
  });
  return r.count;
}
