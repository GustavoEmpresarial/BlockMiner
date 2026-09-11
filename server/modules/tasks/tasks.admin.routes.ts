/**
 * Ported from legacy/server/modules/tasks/tasks.admin.routes.ts. Mounted at /api/admin —
 * inherits requireAdminAuth, same convention as checkin.admin.routes.ts /
 * machines.admin.routes.ts. Full paths /api/admin/daily-tasks/... unchanged from legacy.
 */
import { Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as tasksAdminController from "./tasks.admin.controller.js";

export const tasksAdminRouter = Router();

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });
tasksAdminRouter.use(requireAdminAuth, adminLimiter);

tasksAdminRouter.get("/daily-tasks/definitions", tasksAdminController.listDefinitions);
tasksAdminRouter.post("/daily-tasks/definitions", tasksAdminController.createDefinition);
tasksAdminRouter.patch("/daily-tasks/definitions/:id", tasksAdminController.patchDefinition);
tasksAdminRouter.delete("/daily-tasks/definitions/:id", tasksAdminController.deleteDefinition);
