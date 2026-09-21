import express from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as ctrl from "./broadcast.controller.js";

export const broadcastAdminRouter = express.Router();
const adminLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });

// Require authenticated admin session + rate limiting + broadcast permission
broadcastAdminRouter.use(
  requireAdminAuth,
  adminLimiter,
  requireAdminPermission("broadcast", "promotions")
);

broadcastAdminRouter.post("/broadcast/upload-image", ctrl.uploadBroadcastImage);
broadcastAdminRouter.get("/broadcast", ctrl.adminListBroadcasts);
broadcastAdminRouter.post("/broadcast", ctrl.adminCreateBroadcast);
broadcastAdminRouter.patch("/broadcast/:id", ctrl.adminPatchBroadcast);
broadcastAdminRouter.delete("/broadcast/:id", ctrl.adminDeleteBroadcast);
broadcastAdminRouter.post("/broadcast/:id/reset-views", ctrl.adminResetBroadcastViews);
