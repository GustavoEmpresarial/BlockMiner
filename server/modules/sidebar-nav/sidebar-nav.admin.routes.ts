/**
 * Admin read/write of the user sidebar nav config. Ported from
 * legacy/server/modules/sidebar-nav/sidebarNav.admin.routes.ts.
 * Mounted at /api/admin — same pattern as banners.admin.routes.ts.
 */
import { Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as sidebarNavController from "./sidebar-nav.controller.js";

export const sidebarNavAdminRouter = Router();

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });
sidebarNavAdminRouter.use("/sidebar-nav", requireAdminAuth, adminLimiter);

sidebarNavAdminRouter.get("/sidebar-nav", sidebarNavController.getAdminNav);
sidebarNavAdminRouter.put("/sidebar-nav", sidebarNavController.putAdminNav);
