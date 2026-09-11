/**
 * Ported from legacy/server/modules/zerads/zerads.routes.ts. Only the authenticated
 * `/api/zerads/*` endpoints live here — the public S2S callback (`/zeradsptc.php`) is
 * mounted directly at the app root in bootstrap/server.ts, outside `/api`, with no
 * requireAuth/rate-limiter (it authenticates via IP allowlist + password instead).
 */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as zeradsController from "./zerads.controller.js";

export const zeradsRouter = express.Router();

const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });

zeradsRouter.get("/link", requireAuth, limiter, zeradsController.getUserZeradsLink);
zeradsRouter.get("/history", requireAuth, limiter, zeradsController.getZeradsHistory);
zeradsRouter.get("/stats", requireAuth, limiter, zeradsController.getZeradsStats);
