/**
 * Ported from legacy/server/modules/analytics/analytics.admin.routes.ts (subset — see
 * analytics.admin.controller.ts header for the documented scope cut). Mounted at
 * /api/admin, gated by requireAdminAuth like the other admin sub-routers (matches the
 * pattern in server/modules/admin/admin.routes.ts — analytics has no sidebar-nav gate in
 * legacy either, confirmed by grep: analytics.admin.routes.ts never references
 * requireVisibleSidebarPath, and no other current/ admin module applies that gate to
 * itself — it's a user-facing-feature kill switch, not an admin-route gate).
 */
import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import {
  getStats,
  getAnalytics,
  getExecutive,
  getInflation,
  getProjections,
  getWithdrawalStats,
  getDistribution,
} from "./analytics.admin.controller.js";

export const analyticsAdminRouter = express.Router();

const analyticsLimiter = createRateLimiter({ windowMs: 60_000, max: 120, name: "analytics_admin" });

analyticsAdminRouter.use(requireAdminAuth, analyticsLimiter);

analyticsAdminRouter.get("/stats", getStats);
analyticsAdminRouter.get("/analytics/executive", getExecutive);
analyticsAdminRouter.get("/analytics", getAnalytics);
// Item 10f — sub-tabs deferred at Fase 8 (13d), now ported from legacy in full.
analyticsAdminRouter.get("/analytics/inflation", getInflation);
analyticsAdminRouter.get("/analytics/projections", getProjections);
analyticsAdminRouter.get("/analytics/withdrawals", getWithdrawalStats);
analyticsAdminRouter.get("/analytics/distribution", getDistribution);
