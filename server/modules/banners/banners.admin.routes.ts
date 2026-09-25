/**
 * Admin banners router mounted at /api/admin.
 * Gated by authentication, rate-limiting and fine-grained RBAC permissions.
 */
import { Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import { requireAdminPermission } from "../admin/admin.permissions.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as bannersController from "./banners.controller.js";

export const bannersAdminRouter = Router();

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });
bannersAdminRouter.use("/banners", requireAdminAuth, adminLimiter);

bannersAdminRouter.get(
  "/banners",
  requireAdminPermission("banners.view", "banners", "promotions"),
  bannersController.adminList,
);

bannersAdminRouter.post(
  "/banners",
  requireAdminPermission("banners", "promotions"),
  bannersController.adminCreate,
);

bannersAdminRouter.put(
  "/banners/:id",
  requireAdminPermission("banners", "promotions"),
  bannersController.adminUpdate,
);

bannersAdminRouter.delete(
  "/banners/:id",
  requireAdminPermission("banners", "promotions"),
  bannersController.adminDelete,
);

