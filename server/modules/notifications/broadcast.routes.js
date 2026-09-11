import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import * as ctrl from "./broadcast.controller.js";
export const broadcastRouter = express.Router();
broadcastRouter.get("/active", requireAuth, ctrl.getActiveBroadcast);
broadcastRouter.post("/:id/dismiss", requireAuth, ctrl.dismissBroadcast);
