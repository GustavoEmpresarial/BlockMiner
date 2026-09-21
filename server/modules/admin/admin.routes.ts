import express from "express";
import { requireAdminAuth } from "./admin.auth.middleware.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import {
  listAdminsHandler,
  createAdminHandler,
  updateAdminHandler,
  resetAdminPasswordHandler,
  getAdminSessionsHandler,
  revokeAdminSessionsHandler,
  listMySessionsHandler,
  listAllSessionsHandler,
  revokeSessionHandler,
  revokeOtherSessionsHandler,
  getAdminProfileHandler,
  updateAdminProfileHandler,
  myAuditLogHandler,
  adminAuditLogHandler,
  adminAuditStatsHandler,
  changeOwnPasswordHandler,
  adminOverviewHandler,
} from "./admin.controller.js";
import { backupsAdminRouter } from "./admin.backups.routes.js";
import { fraudSignalsAdminRouter } from "./admin.fraud-signals.routes.js";
import { adminOpsRouter } from "./admin.ops.routes.js";
import { adminLogsRouter } from "./admin.logs.routes.js";
import { adminAiHealthRouter } from "./ai-health/ai-health.routes.js";

export const adminRouter = express.Router();

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });
adminRouter.use(requireAdminAuth, adminLimiter);

// Profile & Personal Admin Management
adminRouter.get("/profile", getAdminProfileHandler);
adminRouter.patch("/profile", updateAdminProfileHandler);
adminRouter.get("/my-audit", myAuditLogHandler);

// Admin CRUD
adminRouter.get("/admins", listAdminsHandler);
adminRouter.post("/admins", createAdminHandler);
adminRouter.patch("/admins/:id", updateAdminHandler);
adminRouter.post("/admins/:id/reset-password", resetAdminPasswordHandler);
adminRouter.get("/admins/:id/sessions", getAdminSessionsHandler);
adminRouter.delete("/admins/:id/sessions", revokeAdminSessionsHandler);

// Sessions
adminRouter.get("/sessions", listMySessionsHandler);
adminRouter.get("/sessions/all", listAllSessionsHandler);
adminRouter.delete("/sessions/other", revokeOtherSessionsHandler);
adminRouter.delete("/sessions/:sessionId", revokeSessionHandler);


// Audit log
adminRouter.get("/admin-audit/stats", adminAuditStatsHandler);
adminRouter.get("/admin-audit", adminAuditLogHandler);

// Own password change
adminRouter.post("/change-password", changeOwnPasswordHandler);

// Overview
adminRouter.get("/admin-overview", adminOverviewHandler);

// Sub-routers (bootstrap-adjacent, ops)
adminRouter.use("/backups", backupsAdminRouter);
adminRouter.use("/fraud-signals", fraudSignalsAdminRouter);
adminRouter.use("/ops", adminOpsRouter);
adminRouter.use("/logs", adminLogsRouter);
adminRouter.use("/ai-health", adminAiHealthRouter);
