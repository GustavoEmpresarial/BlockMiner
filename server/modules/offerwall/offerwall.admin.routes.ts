/**
 * Offerwall Admin Routes — cross-provider analytics reporting.
 * Mounted under /api/admin.
 */
import express from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import { requireAdminPermission } from "../admin/admin.permissions.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { getOfferwallAnalytics } from "./offerwall.admin.controller.js";

export const offerwallAdminRouter = express.Router();

const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });
offerwallAdminRouter.use(requireAdminAuth, adminLimiter);

offerwallAdminRouter.get(
  "/offerwall/analytics",
  requireAdminPermission("offerwall.view", "offerwall"),
  getOfferwallAnalytics,
);
