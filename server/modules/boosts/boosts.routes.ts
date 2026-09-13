import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as ctrl from "./boosts.controller.js";

export const boostsRouter = express.Router();

// Neither route here had a rate limiter (found during a 2026-09-12 audit prompted by the
// same gap already fixed once on public-stats.routes.ts — see that file's header). /activate
// debits POL/BLK/SHIB on every call before the per-day unique-charge constraint can reject
// it, so unlimited hits are a real resource-exhaustion/brute-force vector, not just noise.
const boostsReadLimiter = createRateLimiter({ windowMs: 60_000, max: 60, name: "boosts_read" });
const boostsWriteLimiter = createRateLimiter({ windowMs: 60_000, max: 10, name: "boosts_write" });

boostsRouter.get("/status", requireAuth, boostsReadLimiter, ctrl.getStatus);
boostsRouter.post("/activate", requireAuth, boostsWriteLimiter, ctrl.activate);

// Mounted in bootstrap as BOTH:
//   app.use("/api/boosts", boostsRouter)
//   app.use("/api/power-boost", boostsRouter)  // client usePowerBoostActive contract

