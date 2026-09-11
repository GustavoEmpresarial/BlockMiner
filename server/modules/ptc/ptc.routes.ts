// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Ported from legacy/server/modules/ptc/ptc.routes.ts (user-facing router; admin split into ptc.admin.routes.ts). */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as ctrl from "./ptc.controller.js";
export const ptcRouter = express.Router();
const limiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const viewLimiter = createRateLimiter({ windowMs: 10_000, max: 5 });
const heartbeatLimiter = createRateLimiter({ windowMs: 30_000, max: 10 });
// ── Public ───────────────────────────────────────────────────────────────────
ptcRouter.get("/settings", limiter, ctrl.getSettings);
ptcRouter.get("/tiers", limiter, ctrl.getActiveTiers);
// ── User ─────────────────────────────────────────────────────────────────────
ptcRouter.get("/ads", requireAuth, limiter, ctrl.getAvailableAds);
ptcRouter.get("/earnings", requireAuth, limiter, ctrl.getEarningsHistory);
// ── Sessions ─────────────────────────────────────────────────────────────────
ptcRouter.get("/session/active", requireAuth, limiter, ctrl.getActiveSession);
ptcRouter.post("/session/start", requireAuth, viewLimiter, ctrl.startSession);
ptcRouter.post("/session/:sessionId/heartbeat", requireAuth, heartbeatLimiter, ctrl.heartbeat);
ptcRouter.post("/session/:sessionId/pause", requireAuth, limiter, ctrl.pauseSession);
ptcRouter.post("/session/:sessionId/cancel", requireAuth, limiter, ctrl.cancelSession);
ptcRouter.post("/session/:sessionId/claim", requireAuth, viewLimiter, ctrl.claimSession);
// ── Campaigns (advertiser side) ────────────────────────────────────────────────
ptcRouter.get("/my-campaigns", requireAuth, limiter, ctrl.getMyCampaigns);
ptcRouter.post("/campaigns", requireAuth, limiter, ctrl.createCampaign);
ptcRouter.patch("/campaigns/:id", requireAuth, limiter, ctrl.editCampaign);
ptcRouter.post("/campaigns/:id/add-views", requireAuth, limiter, ctrl.addViews);
ptcRouter.post("/campaigns/:id/remove-views", requireAuth, limiter, ctrl.removeViews);
