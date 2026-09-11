/**
 * Ported from legacy/server/modules/shortlinks/shortlink.routes.ts, incl. the
 * `requireVisibleSidebarPath` operational kill switch (sidebar-nav Fase 8).
 */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import {
  featureTurnstilePassHandler,
  featureTurnstileStatusHandler,
} from "../../shared/security/featureTurnstile.http.js";
import { requireVisibleSidebarPath, sidebarRegistryPath, SIDEBAR_ITEM_REGISTRY } from "../sidebar-nav/index.js";
import * as shortlinksController from "./shortlinks.controller.js";

export const shortlinksRouter = express.Router();

const shortlinksLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const shortlinksPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.shortlinks.path, "shortlinks");
const gate = requireVisibleSidebarPath(shortlinksPath);

shortlinksRouter.get(
  "/turnstile-status",
  requireAuth,
  shortlinksLimiter,
  featureTurnstileStatusHandler("shortlink"),
);
shortlinksRouter.post(
  "/turnstile-pass",
  requireAuth,
  shortlinksLimiter,
  featureTurnstilePassHandler("shortlink"),
);
shortlinksRouter.get("/status", requireAuth, gate, shortlinksLimiter, shortlinksController.getShortlinkStatus);
shortlinksRouter.post("/start", requireAuth, gate, shortlinksLimiter, shortlinksController.startShortlink);
shortlinksRouter.post("/complete-step", requireAuth, gate, shortlinksLimiter, shortlinksController.completeShortlinkStep);
shortlinksRouter.post("/pastead/start", requireAuth, gate, shortlinksLimiter, shortlinksController.startPasteadShortlink);
shortlinksRouter.post("/pastead/done", requireAuth, gate, shortlinksLimiter, shortlinksController.markPasteadDone);
shortlinksRouter.post("/pastead/claim", requireAuth, gate, shortlinksLimiter, shortlinksController.claimPasteadShortlink);
shortlinksRouter.post("/adlinkfly/start", requireAuth, gate, shortlinksLimiter, shortlinksController.startAdlinkflyShortlink);
shortlinksRouter.post("/adlinkfly/done", requireAuth, gate, shortlinksLimiter, shortlinksController.markAdlinkflyDone);
shortlinksRouter.post("/adlinkfly/claim", requireAuth, gate, shortlinksLimiter, shortlinksController.claimAdlinkflyShortlink);
