/**
 * User and system activity audit logs for /api/admin/logs.
 * Distinct from /admin-audit (AdminAuditLog — admin-action rows).
 * Protected by requireAdminAuth + requireAdminPermission("logs.view").
 */
import express from "express";
import { logger } from "../../core/logger/index.js";
import { requireAdminPermission } from "./admin.permissions.js";
import { logAdminAction } from "./admin.audit-log.service.js";
import {
  queryAuditLogs,
  getAuditLogById,
  exportAuditLogs,
  type AuditLogQueryParams,
} from "./admin.logs.service.js";

export const adminLogsRouter = express.Router();
const log = logger.child("AdminLogs");

// RBAC: Require logs.view (moderators, admins, and super_admins have access)
adminLogsRouter.use(requireAdminPermission("logs.view"));

/**
 * GET /api/admin/logs/export
 * Exports audit logs matching query filters as CSV or JSON (up to 5,000 records).
 */
adminLogsRouter.get("/export", async (req, res) => {
  try {
    const format = req.query.format === "json" ? "json" : "csv";
    const params: AuditLogQueryParams = {
      source: typeof req.query.source === "string" ? req.query.source : undefined,
      severity: typeof req.query.severity === "string" ? req.query.severity : undefined,
      action: typeof req.query.action === "string" ? req.query.action : undefined,
      userId: req.query.userId ? Number(req.query.userId) : undefined,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
    };

    const exportResult = await exportAuditLogs(params, format);

    // Audit log this export action
    if (req.admin) {
      void logAdminAction({
        adminId: req.admin.adminId,
        adminEmail: req.admin.email,
        sessionId: req.admin.sessionId,
        action: "EXPORT_SYSTEM_LOGS",
        module: "logs",
        resource: "AuditLog",
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        newValue: {
          format,
          filters: params,
          count: exportResult.count,
        },
      });
    }

    res.setHeader("Content-Type", exportResult.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${exportResult.filename}"`);
    res.status(200).send(exportResult.data);
  } catch (error) {
    log.error("export logs failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Failed to export audit logs." });
  }
});

/**
 * GET /api/admin/logs
 * List system/user audit logs with dynamic filtering, full-text search, and summaries.
 */
adminLogsRouter.get("/", async (req, res) => {
  try {
    const params: AuditLogQueryParams = {
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
      source: typeof req.query.source === "string" ? req.query.source : undefined,
      severity: typeof req.query.severity === "string" ? req.query.severity : undefined,
      action: typeof req.query.action === "string" ? req.query.action : undefined,
      userId: req.query.userId ? Number(req.query.userId) : undefined,
      q: typeof req.query.q === "string" ? req.query.q : undefined,
      from: typeof req.query.from === "string" ? req.query.from : undefined,
      to: typeof req.query.to === "string" ? req.query.to : undefined,
    };

    const result = await queryAuditLogs(params);
    res.json(result);
  } catch (error) {
    log.error("list logs failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Failed to list audit logs." });
  }
});

/**
 * GET /api/admin/logs/:id
 * Retrieve detail of a single audit log row.
 */
adminLogsRouter.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      res.status(400).json({ ok: false, message: "Invalid log id." });
      return;
    }

    const row = await getAuditLogById(id);
    if (!row) {
      res.status(404).json({ ok: false, message: "Audit log entry not found." });
      return;
    }

    res.json({ ok: true, data: row });
  } catch (error) {
    log.error("get log failed", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ ok: false, message: "Failed to load audit log." });
  }
});
