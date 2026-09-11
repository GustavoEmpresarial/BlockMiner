// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/traffic/traffic.routes.ts. Public, unauthenticated
 * acquisition-tracking + client-telemetry surface. Deviation: mounted at /api/track
 * (not /api/traffic) in bootstrap/server.ts, matching legacy's
 * backend/src/app/mount/publicSurfaceRoutes.mount.ts (`app.use("/api/track", trafficRouter)`)
 * — the client already calls that path, so the URL contract is preserved even though the
 * module folder is named traffic/.
 */
import express from "express";
import { authenticateTokenOptional } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { postClientError, postHit } from "./traffic.controller.js";
export const trafficRouter = express.Router();
const hitLimiter = createRateLimiter({ windowMs: 30_000, max: 3 });
const clientErrorLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
trafficRouter.post("/hit", hitLimiter, postHit);
trafficRouter.post("/client-error", clientErrorLimiter, authenticateTokenOptional, postClientError);
