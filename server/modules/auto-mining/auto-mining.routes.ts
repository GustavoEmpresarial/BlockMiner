/**
 * Mounts both v1 ("/available", "/claim", "/history", "/active-reward") and v2 ("/v2/*") auto
 * mining endpoints. Ported 1:1 from legacy/server/modules/auto-mining/auto-mining.routes.ts,
 * incl. the `requireVisibleSidebarPath` operational kill switch (sidebar-nav Fase 8).
 */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import {
  featureTurnstilePassHandler,
  featureTurnstileStatusHandler,
} from "../../shared/security/featureTurnstile.http.js";
import { requireVisibleSidebarPath, sidebarRegistryPath, SIDEBAR_ITEM_REGISTRY } from "../sidebar-nav/index.js";
import * as v1 from "./auto-mining.controller.js";
import * as v2 from "./auto-mining.v2.controller.js";

export const autoMiningRouter = express.Router();

const v2SessionLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 15,
  keyGenerator: (req) => `autoMiningV2:session:${req.user?.id ?? "anon"}`,
});

const v2ClaimLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 12,
  keyGenerator: (req) => `autoMiningV2:claim:${req.user?.id ?? "anon"}`,
});

/** Pause/resume must never compete with claims for budget. Sharing v2ClaimLimiter meant a user
 *  who had just spent the 12/min claim allowance got 429 on pause, so leaving the page silently
 *  failed to freeze the session — the exact bug users report as "it does not pause". These are
 *  idempotent state flips, so a wider window is safe. */
const v2PresenceLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 40,
  keyGenerator: (req) => `autoMiningV2:presence:${req.user?.id ?? "anon"}`,
});

const v2BannerLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 35,
  keyGenerator: (req) => `autoMiningV2:banner:${req.user?.id ?? "anon"}`,
});

const autoMiningPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.auto_mining.path, "auto_mining");
const gate = requireVisibleSidebarPath(autoMiningPath);

autoMiningRouter.get("/turnstile-status", requireAuth, featureTurnstileStatusHandler("automining"));
autoMiningRouter.post("/turnstile-pass", requireAuth, featureTurnstilePassHandler("automining"));

// V1 endpoints
autoMiningRouter.get("/available", requireAuth, gate, v1.getAvailableGPUsHandler);
autoMiningRouter.post("/claim", requireAuth, gate, v1.claimGPUHandler);
autoMiningRouter.get("/history", requireAuth, gate, v1.getGPUHistoryHandler);
autoMiningRouter.get("/active-reward", requireAuth, gate, v1.getActiveRewardHandler);

// V2 endpoints
autoMiningRouter.post("/v2/session/start", requireAuth, gate, v2SessionLimiter, v2.postStartSession);
autoMiningRouter.post("/v2/session/stop", requireAuth, gate, v2SessionLimiter, v2.postStopSession);
// Pause fires on every page-leave / tab-switch, so it gets its own presence budget — never the
// claim limiter's, which the 1s claim poll can exhaust.
autoMiningRouter.post("/v2/session/pause", requireAuth, gate, v2PresenceLimiter, v2.postPauseSession);
autoMiningRouter.post("/v2/session/resume", requireAuth, gate, v2PresenceLimiter, v2.postResumeSession);
autoMiningRouter.get("/v2/status", requireAuth, gate, v2.getV2Status);
autoMiningRouter.post("/v2/claim/normal", requireAuth, gate, v2ClaimLimiter, v2.postClaimNormal);
autoMiningRouter.get("/v2/banner", requireAuth, gate, v2BannerLimiter, v2.getTurboBanner);
autoMiningRouter.post("/v2/banner/click", requireAuth, gate, v2BannerLimiter, v2.postBannerClick);
autoMiningRouter.post("/v2/claim/turbo", requireAuth, gate, v2ClaimLimiter, v2.postClaimTurbo);
