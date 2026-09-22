/**
 * Admin Client Errors Controller.
 * Review and manage client crash / API failure telemetry.
 * Authenticated via requireAdminAuth and RBAC protected via requireAdminPermission.
 */
import type { Request, Response } from "express";
import { logger } from "../../core/logger/index.js";
import { clearClientErrorReports, listClientErrorReports } from "./traffic.service.js";
import { logAdminAction } from "../admin/admin.audit-log.service.js";

const log = logger.child("traffic.client-errors.admin");

export async function adminListClientErrors(req: Request, res: Response): Promise<void> {
  try {
    const rawLimit = Number(req.query.limit ?? 500);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 500 : rawLimit, 1), 1000);
    const offset = Math.max(Number(req.query.offset ?? 0) || 0, 0);

    const rawCategory = typeof req.query.category === "string" ? req.query.category.trim().toLowerCase() : "";
    const category = rawCategory === "crash" || rawCategory === "api_failure" ? rawCategory : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : undefined;

    const items = await listClientErrorReports({ limit, offset, category, search });
    res.json({ ok: true, items });
  } catch (err) {
    log.error("[admin client-errors error]", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Erro ao carregar reports." });
  }
}

export async function adminClearClientErrors(req: Request, res: Response): Promise<void> {
  try {
    const deleted = await clearClientErrorReports();

    void logAdminAction({
      adminId: (req as any).admin?.adminId,
      adminEmail: (req as any).admin?.email,
      sessionId: (req as any).admin?.sessionId,
      action: "CLIENT_ERRORS_CLEAR",
      module: "system",
      resource: "ClientErrorReports",
      newValue: { deleted },
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.json({ ok: true, deleted });
  } catch (err) {
    log.error("[admin client-errors delete error]", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ ok: false, message: "Erro ao limpar reports." });
  }
}
