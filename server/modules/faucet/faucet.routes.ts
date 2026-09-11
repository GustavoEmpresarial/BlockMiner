/**
 * Ported from legacy/server/modules/faucet/faucet.routes.ts, incl. the
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
import * as faucetController from "./faucet.controller.js";

export const faucetRouter = express.Router();
const faucetLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });
const faucetClaimLimiter = createRateLimiter({ windowMs: 60_000, max: 6 });
const faucetPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.faucet.path, "faucet");
const gate = requireVisibleSidebarPath(faucetPath);

faucetRouter.get("/turnstile-status", requireAuth, faucetLimiter, featureTurnstileStatusHandler("faucet"));
faucetRouter.post("/turnstile-pass", requireAuth, faucetLimiter, featureTurnstilePassHandler("faucet"));
faucetRouter.get("/status", requireAuth, gate, faucetLimiter, faucetController.getStatus);
faucetRouter.post(
  "/partner/start",
  requireAuth,
  gate,
  faucetLimiter,
  faucetController.startPartnerVisit,
);
faucetRouter.post("/claim", requireAuth, gate, faucetClaimLimiter, faucetController.claim);
