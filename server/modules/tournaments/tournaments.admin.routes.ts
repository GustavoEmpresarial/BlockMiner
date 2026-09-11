import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import * as ctrl from "./tournaments.admin.controller.js";

export const tournamentsAdminRouter = express.Router();
/** Alias matching legacy export name. */
export const adminTournamentsRouter = tournamentsAdminRouter;

tournamentsAdminRouter.use(requireAdminAuth);

tournamentsAdminRouter.get("/", ctrl.listAll);
tournamentsAdminRouter.get("/display-order", ctrl.getDisplayOrder);
tournamentsAdminRouter.patch("/display-order", ctrl.updateDisplayOrder);
tournamentsAdminRouter.post("/", ctrl.create);
tournamentsAdminRouter.patch("/:id", ctrl.update);
tournamentsAdminRouter.post("/:id/cancel", ctrl.cancel);
tournamentsAdminRouter.post("/:id/finalize", ctrl.finalize);
tournamentsAdminRouter.get("/:id/entries", ctrl.entries);
tournamentsAdminRouter.get("/:id/score-audit", ctrl.scoreAudit);
tournamentsAdminRouter.get("/:id/score-audit/:userId", ctrl.scoreAuditUser);
tournamentsAdminRouter.get("/:id/engine-stats", ctrl.engineStats);
tournamentsAdminRouter.get("/:id/drift-alerts", ctrl.driftAlerts);
tournamentsAdminRouter.get("/:id/migration", ctrl.offerwallMigration);
tournamentsAdminRouter.get("/:id/shadow-alerts", ctrl.shadowAlerts);
