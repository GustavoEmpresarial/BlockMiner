/**
 * Admin read/write of the user sidebar nav config.
 * Mounted at /api/admin — e.g. /api/admin/sidebar-nav.
 */
import { Router } from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import * as sidebarNavController from "./sidebar-nav.controller.js";

export const sidebarNavAdminRouter: Router = Router();

sidebarNavAdminRouter.use("/sidebar-nav", requireAdminAuth);

const readLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 120,
  name: "sidebar_nav_admin_read",
});

const writeLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 300,
  name: "sidebar_nav_admin_write",
});

sidebarNavAdminRouter.get(
  "/sidebar-nav",
  readLimiter,
  requireAdminPermission("config.view", "config", "sidebar_nav.view", "sidebar_nav"),
  sidebarNavController.getAdminNav
);

sidebarNavAdminRouter.put(
  "/sidebar-nav",
  writeLimiter,
  requireAdminPermission("config", "sidebar_nav"),
  sidebarNavController.putAdminNav
);

