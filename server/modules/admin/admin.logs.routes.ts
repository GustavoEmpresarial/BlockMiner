/**
 * User activity audit logs for /api/admin/logs (legacy AdminLogs surface).
 * Distinct from /admin-audit (AdminAuditLog — admin-action rows).
 */
import express from "express";
import type { Request, Response } from "express";
import prisma from "../../core/database/prisma.js";
import { logger } from "../../core/logger/index.js";

export const adminLogsRouter = express.Router();
const log = logger.child("AdminLogs");

adminLogsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
    const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
    const userIdRaw = typeof req.query.userId === "string" ? Number(req.query.userId) : NaN;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const where: Record<string, unknown> = {};
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (Number.isSafeInteger(userIdRaw) && userIdRaw > 0) where.userId = userIdRaw;
    if (q) {
      where.OR = [
        { action: { contains: q, mode: "insensitive" } },
        { label: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { ip: { contains: q, mode: "insensitive" } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          userId: true,
          action: true,
          label: true,
          description: true,
          source: true,
          severity: true,
          ip: true,
          metadata: true,
          detailsJson: true,
          actorAdminId: true,
          createdAt: true,
          user: { select: { email: true, username: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      ok: true,
      logs: logs.map((row) => ({
        ...row,
        user_email: row.user?.email ?? null,
        user_id: row.userId,
        created_at: row.createdAt,
      })),
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
    });
  } catch (error) {
    log.error("list logs", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Failed to list audit logs." });
  }
});

adminLogsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid id." });
      return;
    }
    const row = await prisma.auditLog.findUnique({
      where: { id },
      include: { user: { select: { email: true, username: true, id: true } } },
    });
    if (!row) {
      res.status(404).json({ ok: false, message: "Not found." });
      return;
    }
    res.json({ ok: true, data: row });
  } catch (error) {
    log.error("get log", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Failed to load audit log." });
  }
});
