/**
 * Public traffic & telemetry routes.
 * Mounted at /api/track in bootstrap/server.ts.
 */
import express from "express";
import { authenticateTokenOptional } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { postClientError, postHit } from "./traffic.controller.js";

export const trafficRouter = express.Router();

const hitLimiter = createRateLimiter({ windowMs: 30_000, max: 10 });
const clientErrorLimiter = createRateLimiter({ windowMs: 60_000, max: 30 });

trafficRouter.post("/hit", hitLimiter, postHit);
trafficRouter.post("/client-error", clientErrorLimiter, authenticateTokenOptional, postClientError);
