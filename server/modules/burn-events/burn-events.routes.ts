import { Router } from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import * as ctrl from "./burn-events.controller.js";

export const burnEventsRouter = Router();
burnEventsRouter.get("/", requireAuth, ctrl.listActive);
burnEventsRouter.get("/my-machines", requireAuth, ctrl.myMachines);
burnEventsRouter.post("/:id/start", requireAuth, ctrl.start);
burnEventsRouter.post("/:id/claim", requireAuth, ctrl.claim);
