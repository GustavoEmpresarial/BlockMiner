// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import express from "express";
import * as miningController from "./mining.controller.js";
import { requireAuth, authenticateTokenOptional } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
export const miningRouter = express.Router();
const readLimiter = createRateLimiter({ windowMs: 60_000, max: 120, name: "mining_read" });
const writeLimiter = createRateLimiter({ windowMs: 60_000, max: 30, name: "mining_write" });
miningRouter.get("/cycle", authenticateTokenOptional, readLimiter, miningController.getCycle);
miningRouter.get("/reward-rate", requireAuth, readLimiter, miningController.getRewardRate);
miningRouter.patch("/allocation", requireAuth, writeLimiter, miningController.updateAllocation);
miningRouter.patch("/payout-mode", requireAuth, writeLimiter, miningController.updatePayoutMode);
miningRouter.post("/boost", requireAuth, writeLimiter, miningController.applyBoost);
miningRouter.post("/upgrade-rig", requireAuth, writeLimiter, miningController.upgradeRig);
