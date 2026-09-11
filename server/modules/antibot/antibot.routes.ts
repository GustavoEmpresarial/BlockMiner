/** Full port of legacy/server/modules/antibot/antibot.routes.ts. */
import express from "express";
import { authenticateTokenOptional } from "../../core/http/middleware/auth.js";
import { requireAdminAuth } from "../admin/index.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import {
  adminClearAntibot,
  adminListAlerts,
  adminListDevices,
  adminListEvidence,
  adminListSessions,
  adminOverview,
  adminOverviewLegacy,
  adminRecompute,
  adminSetTrusted,
  adminUpdateAlert,
  adminUserProfile,
  collectTelemetry,
} from "./antibot.controller.js";

/** Public telemetry collector — auth optional, always returns 200. */
export const antibotRouter = express.Router();
antibotRouter.post("/telemetry", authenticateTokenOptional, collectTelemetry);

/** Admin investigation API — requireAdminAuth applied here directly (module is mounted
 * standalone at /api/admin/antibot, not nested inside admin's own Router). */
export const antibotAdminRouter = express.Router();
const antibotAdminLimiter = createRateLimiter({ windowMs: 60_000, max: 300 });
antibotAdminRouter.use(requireAdminAuth, antibotAdminLimiter);
antibotAdminRouter.get("/overview", adminOverview);
antibotAdminRouter.get("/overview-legacy", adminOverviewLegacy);
antibotAdminRouter.get("/evidence", adminListEvidence);
antibotAdminRouter.get("/sessions", adminListSessions);
antibotAdminRouter.get("/devices", adminListDevices);
antibotAdminRouter.get("/alerts", adminListAlerts);
antibotAdminRouter.patch("/alerts/:id", adminUpdateAlert);
antibotAdminRouter.get("/users/:id", adminUserProfile);
antibotAdminRouter.post("/users/:id/trust", adminSetTrusted);
antibotAdminRouter.post("/users/:id/recompute", adminRecompute);
antibotAdminRouter.post("/reset", adminClearAntibot);
