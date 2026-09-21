import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as ctrl from "./broadcast.controller.js";

export const broadcastRouter = express.Router();
const userBroadcastLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });

broadcastRouter.use(userBroadcastLimiter);
broadcastRouter.get("/active", requireAuth, ctrl.getActiveBroadcast);
broadcastRouter.post("/:id/dismiss", requireAuth, ctrl.dismissBroadcast);
