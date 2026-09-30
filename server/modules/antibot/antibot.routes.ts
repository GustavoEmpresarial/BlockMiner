/** Full port of legacy/server/modules/antibot/antibot.routes.ts with distributed rate limiting & RBAC. */
import express, { type Router } from "express";
import { authenticateTokenOptional } from "../../core/http/middleware/auth.js";
import { requireAdminAuth } from "../admin/index.js";
import { requireAdminPermission } from "../admin/admin.permissions.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import * as antibotController from "./antibot.controller.js";

/** Public telemetry collector — auth optional, always returns 200. */
export const antibotRouter: Router = express.Router();
antibotRouter.post("/telemetry", authenticateTokenOptional, antibotController.collectTelemetry);

/** Admin investigation API — mounted at /api/admin/antibot. */
export const antibotAdminRouter: Router = express.Router();
antibotAdminRouter.use(requireAdminAuth);

const readLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 120,
  name: "antibot_admin_read",
});

const writeLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 120,
  name: "antibot_admin_write",
});

const resetLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 10,
  name: "antibot_admin_reset",
});

antibotAdminRouter.get(
  "/overview",
  readLimiter,
  requireAdminPermission("antibot.view", "antibot"),
  antibotController.adminOverview
);

antibotAdminRouter.get(
  "/evidence",
  readLimiter,
  requireAdminPermission("antibot.view", "antibot"),
  antibotController.adminListEvidence
);

antibotAdminRouter.get(
  "/sessions",
  readLimiter,
  requireAdminPermission("antibot.view", "antibot"),
  antibotController.adminListSessions
);

antibotAdminRouter.get(
  "/devices",
  readLimiter,
  requireAdminPermission("antibot.view", "antibot"),
  antibotController.adminListDevices
);

antibotAdminRouter.get(
  "/alerts",
  readLimiter,
  requireAdminPermission("antibot.view", "antibot"),
  antibotController.adminListAlerts
);

antibotAdminRouter.patch(
  "/alerts/:id",
  writeLimiter,
  requireAdminPermission("antibot"),
  antibotController.adminUpdateAlert
);

antibotAdminRouter.get(
  "/users/:id",
  readLimiter,
  requireAdminPermission("antibot.view", "antibot"),
  antibotController.adminUserProfile
);

antibotAdminRouter.post(
  "/users/:id/trust",
  writeLimiter,
  requireAdminPermission("antibot"),
  antibotController.adminSetTrusted
);

antibotAdminRouter.post(
  "/users/:id/recompute",
  writeLimiter,
  requireAdminPermission("antibot"),
  antibotController.adminRecompute
);

antibotAdminRouter.post(
  "/reset",
  resetLimiter,
  requireAdminPermission("antibot"),
  antibotController.adminClearAntibot
);
