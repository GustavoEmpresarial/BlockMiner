/**
 * Admin Traffic & Origin Analytics Routes.
 * Mounted at /api/admin inside bootstrap/server.ts.
 * Full paths /api/admin/traffic/* unchanged.
 * Protected by requireAdminAuth + distributed rate limiter + requireAdminPermission.
 */
import express from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import {
  adminGetTrafficByDomain,
  adminGetTrafficByUtm,
  adminGetTrafficDaily,
  adminGetTrafficSummary,
} from "./traffic.admin.controller.js";

export const trafficAdminRouter = express.Router();

const trafficAdminLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

trafficAdminRouter.use(
  requireAdminAuth,
  trafficAdminLimiter,
  requireAdminPermission("traffic", "traffic.view", "monitoring", "dashboard")
);

trafficAdminRouter.get("/traffic/summary", adminGetTrafficSummary);
trafficAdminRouter.get("/traffic/by-domain", adminGetTrafficByDomain);
trafficAdminRouter.get("/traffic/by-utm", adminGetTrafficByUtm);
trafficAdminRouter.get("/traffic/daily", adminGetTrafficDaily);
