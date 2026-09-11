/**
 * Ported from legacy/server/modules/checkin/checkinMilestone.admin.routes.ts.
 * Mounted at /api/admin — inherits requireAdminAuth from bootstrap wiring like
 * mining.admin.routes.ts / machines.admin.routes.ts.
 */
import { Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as checkinAdminController from "./checkin.admin.controller.js";

export const checkinAdminRouter = Router();

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });
checkinAdminRouter.use(requireAdminAuth, adminLimiter);

checkinAdminRouter.get("/checkin-milestones", checkinAdminController.listCheckinMilestones);
checkinAdminRouter.post("/checkin-milestones", checkinAdminController.createCheckinMilestone);
checkinAdminRouter.put("/checkin-milestones/:id", checkinAdminController.updateCheckinMilestone);
checkinAdminRouter.delete("/checkin-milestones/:id", checkinAdminController.deleteCheckinMilestone);
checkinAdminRouter.get("/checkin-streak-anomalies", checkinAdminController.listCheckinStreakAnomalies);
