import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as statsController from "./stats.controller.js";

export const statsRouter = express.Router();
const statsLimiter = createRateLimiter({ windowMs: 60_000, max: 45, name: "stats" });
statsRouter.get("/power", requireAuth, statsLimiter, statsController.getPowerStats);
statsRouter.get("/earnings", requireAuth, statsLimiter, statsController.getEarningsStats);
