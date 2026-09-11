import { Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import * as ctrl from "./burn-events.admin.controller.js";

export const burnEventsAdminRouter = Router();

burnEventsAdminRouter.use(requireAdminAuth);

burnEventsAdminRouter.get("/", ctrl.listAll);
burnEventsAdminRouter.post("/", ctrl.create);
burnEventsAdminRouter.put("/:id", ctrl.update);
burnEventsAdminRouter.delete("/:id", ctrl.remove);
burnEventsAdminRouter.get("/:id/claims", ctrl.claims);
