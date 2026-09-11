/** Ported from legacy/server/modules/racks/racks.routes.ts. */
import express from "express";
import { requireAuth } from "../../../core/http/middleware/auth.js";
import * as racksController from "./racks.controller.js";

export const racksRouter = express.Router();
racksRouter.get("/", requireAuth, racksController.listRacks);
racksRouter.post("/update", requireAuth, racksController.updateRack);
