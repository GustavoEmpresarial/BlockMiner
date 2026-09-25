import express from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import { requireAdminPermission } from "../admin/admin.permissions.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as ctrl from "./tournaments.admin.controller.js";

/** Admin tournament reads (list, entries, audits). */
export const TOURNAMENT_ADMIN_RATE_LIMIT_WINDOW_MS = 60_000;
export const TOURNAMENT_ADMIN_RATE_LIMIT_MAX = 60;
/** Finalize / cancel / mutate — lower ceiling; finalize is expensive. */
export const TOURNAMENT_ADMIN_WRITE_RATE_LIMIT_WINDOW_MS = 60_000;
export const TOURNAMENT_ADMIN_WRITE_RATE_LIMIT_MAX = 20;
export const TOURNAMENT_ADMIN_FINALIZE_RATE_LIMIT_MAX = 10;

export const tournamentsAdminRouter = express.Router();
/** Alias matching legacy export name. */
export const adminTournamentsRouter = tournamentsAdminRouter;

const adminReadLimiter = createRateLimiter({
  windowMs: TOURNAMENT_ADMIN_RATE_LIMIT_WINDOW_MS,
  max: TOURNAMENT_ADMIN_RATE_LIMIT_MAX,
  name: "tournaments_admin_read",
});
const adminWriteLimiter = createRateLimiter({
  windowMs: TOURNAMENT_ADMIN_WRITE_RATE_LIMIT_WINDOW_MS,
  max: TOURNAMENT_ADMIN_WRITE_RATE_LIMIT_MAX,
  name: "tournaments_admin_write",
});
const adminFinalizeLimiter = createRateLimiter({
  windowMs: TOURNAMENT_ADMIN_WRITE_RATE_LIMIT_WINDOW_MS,
  max: TOURNAMENT_ADMIN_FINALIZE_RATE_LIMIT_MAX,
  name: "tournaments_admin_finalize",
});

tournamentsAdminRouter.use(requireAdminAuth);

// Read endpoints gated by tournaments.view or tournaments
tournamentsAdminRouter.get("/", adminReadLimiter, requireAdminPermission("tournaments.view", "tournaments"), ctrl.listAll);
tournamentsAdminRouter.get("/display-order", adminReadLimiter, requireAdminPermission("tournaments.view", "tournaments"), ctrl.getDisplayOrder);
tournamentsAdminRouter.get("/:id/entries", adminReadLimiter, requireAdminPermission("tournaments.view", "tournaments"), ctrl.entries);
tournamentsAdminRouter.get("/:id/score-audit", adminReadLimiter, requireAdminPermission("tournaments.view", "tournaments"), ctrl.scoreAudit);
tournamentsAdminRouter.get("/:id/score-audit/:userId", adminReadLimiter, requireAdminPermission("tournaments.view", "tournaments"), ctrl.scoreAuditUser);
tournamentsAdminRouter.get("/:id/engine-stats", adminReadLimiter, requireAdminPermission("tournaments.view", "tournaments"), ctrl.engineStats);
tournamentsAdminRouter.get("/:id/drift-alerts", adminReadLimiter, requireAdminPermission("tournaments.view", "tournaments"), ctrl.driftAlerts);
tournamentsAdminRouter.get("/:id/migration", adminReadLimiter, requireAdminPermission("tournaments.view", "tournaments"), ctrl.offerwallMigration);

// Write endpoints gated strictly by tournaments permission
tournamentsAdminRouter.patch("/display-order", adminWriteLimiter, requireAdminPermission("tournaments"), ctrl.updateDisplayOrder);
tournamentsAdminRouter.post("/", adminWriteLimiter, requireAdminPermission("tournaments"), ctrl.create);
tournamentsAdminRouter.patch("/:id", adminWriteLimiter, requireAdminPermission("tournaments"), ctrl.update);
tournamentsAdminRouter.post("/:id/cancel", adminWriteLimiter, requireAdminPermission("tournaments"), ctrl.cancel);
tournamentsAdminRouter.post("/:id/finalize", adminFinalizeLimiter, requireAdminPermission("tournaments"), ctrl.finalize);

