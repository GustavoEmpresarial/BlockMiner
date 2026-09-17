import express from "express";
import { requireAdminAuth } from "../admin/index.js";
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

tournamentsAdminRouter.get("/", adminReadLimiter, ctrl.listAll);
tournamentsAdminRouter.get("/display-order", adminReadLimiter, ctrl.getDisplayOrder);
tournamentsAdminRouter.patch("/display-order", adminWriteLimiter, ctrl.updateDisplayOrder);
tournamentsAdminRouter.post("/", adminWriteLimiter, ctrl.create);
tournamentsAdminRouter.patch("/:id", adminWriteLimiter, ctrl.update);
tournamentsAdminRouter.post("/:id/cancel", adminWriteLimiter, ctrl.cancel);
tournamentsAdminRouter.post("/:id/finalize", adminFinalizeLimiter, ctrl.finalize);
tournamentsAdminRouter.get("/:id/entries", adminReadLimiter, ctrl.entries);
tournamentsAdminRouter.get("/:id/score-audit", adminReadLimiter, ctrl.scoreAudit);
tournamentsAdminRouter.get("/:id/score-audit/:userId", adminReadLimiter, ctrl.scoreAuditUser);
tournamentsAdminRouter.get("/:id/engine-stats", adminReadLimiter, ctrl.engineStats);
tournamentsAdminRouter.get("/:id/drift-alerts", adminReadLimiter, ctrl.driftAlerts);
tournamentsAdminRouter.get("/:id/migration", adminReadLimiter, ctrl.offerwallMigration);
