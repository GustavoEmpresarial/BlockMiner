/**
 * Ported from legacy/server/modules/checkin/checkinMilestone.admin.routes.ts.
 * Mounted at /api/admin — protected by requireAdminAuth, dedicated distributed rate limiter, and granular RBAC.
 */
import { Router } from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import * as checkinAdminController from "./checkin.admin.controller.js";

export const checkinAdminRouter = Router();

const adminLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 300,
  name: "admin_checkin",
  keyGenerator: (req) => `admin_ip:${getClientIp(req)}`,
  secondaryKeyGenerator: (req) => (req.admin?.adminId ? `admin:${req.admin.adminId}` : null),
});

checkinAdminRouter.use(requireAdminAuth);
checkinAdminRouter.use(adminLimiter);

const viewGuard = requireAdminPermission("checkin.view", "checkin");
const manageGuard = requireAdminPermission("checkin");

checkinAdminRouter.get("/checkin-milestones", viewGuard, checkinAdminController.listCheckinMilestones);
checkinAdminRouter.post("/checkin-milestones", manageGuard, checkinAdminController.createCheckinMilestone);
checkinAdminRouter.put("/checkin-milestones/:id", manageGuard, checkinAdminController.updateCheckinMilestone);
checkinAdminRouter.patch("/checkin-milestones/:id", manageGuard, checkinAdminController.updateCheckinMilestone);
checkinAdminRouter.delete("/checkin-milestones/:id", manageGuard, checkinAdminController.deleteCheckinMilestone);

checkinAdminRouter.get("/checkin-streak-anomalies", viewGuard, checkinAdminController.listCheckinStreakAnomalies);
