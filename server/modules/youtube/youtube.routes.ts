/**
 * Ported from legacy/server/modules/youtube/youtube.routes.ts, incl. the
 * `requireVisibleSidebarPath` operational kill switch (sidebar-nav Fase 8 — same pattern as
 * read-earn/routes.ts). The registry already had a `youtube` entry (added ahead of this
 * module existing — see sidebar-nav.registry.ts header note), so this just wires the real gate.
 */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import {
  featureTurnstilePassHandler,
  featureTurnstileStatusHandler,
} from "../../shared/security/featureTurnstile.http.js";
import { requireVisibleSidebarPath, sidebarRegistryPath, SIDEBAR_ITEM_REGISTRY } from "../sidebar-nav/index.js";
import * as youtubeController from "./youtube.controller.js";

export const youtubeRouter = express.Router();

const youtubePath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.youtube.path, "youtube");
const claimLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 60 });
const gate = requireVisibleSidebarPath(youtubePath);

youtubeRouter.get("/turnstile-status", requireAuth, featureTurnstileStatusHandler("youtube"));
youtubeRouter.post("/turnstile-pass", requireAuth, featureTurnstilePassHandler("youtube"));
youtubeRouter.get("/status", requireAuth, gate, youtubeController.getStatus);
youtubeRouter.get("/stats", requireAuth, gate, youtubeController.getStats);
youtubeRouter.post(
  "/claim",
  requireAuth,
  gate,
  claimLimiter,
  youtubeController.claimReward,
);
