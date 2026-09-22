/**
 * Admin client-errors routes — crash and API failure telemetry review.
 * Mounted at /api/admin inside bootstrap/server.ts.
 * Security: protected by requireAdminAuth + requireAdminPermission("logs.view" / "logs").
 * Audit: all administrative operations logged via logAdminAction.
 */
import express from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import { adminClearClientErrors, adminListClientErrors } from "./traffic.client-errors.admin.controller.js";

export const clientErrorsAdminRouter = express.Router();

clientErrorsAdminRouter.use(requireAdminAuth);

// GET /api/admin/client-errors — list telemetry reports
clientErrorsAdminRouter.get("/client-errors", requireAdminPermission("logs.view"), adminListClientErrors);

// DELETE /api/admin/client-errors — clear telemetry reports
clientErrorsAdminRouter.delete("/client-errors", requireAdminPermission("logs"), adminClearClientErrors);
