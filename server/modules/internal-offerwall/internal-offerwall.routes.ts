/**
 * Ported from legacy/server/modules/internal-offerwall/internal-offerwall.routes.ts, incl. the
 * `requireVisibleSidebarPath` operational kill switch (sidebar-nav Fase 8).
 */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { requireCriticalIdempotency } from "../../core/http/middleware/idempotency.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import { requireVisibleSidebarPath, sidebarRegistryPath, SIDEBAR_ITEM_REGISTRY } from "../sidebar-nav/index.js";
import * as ctrl from "./internal-offerwall.controller.js";

export const internalOfferwallRouter = express.Router();

const limiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 60,
  name: "internal_offerwall_read",
  keyGenerator: (req) => `ip:${getClientIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});
const writeLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 30,
  name: "internal_offerwall_write",
  keyGenerator: (req) => `ip:${getClientIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});

const internalOfferwallPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.internal_offerwall.path, "internal_offerwall");
const gate = requireVisibleSidebarPath(internalOfferwallPath);

internalOfferwallRouter.get("/status", gate, limiter, ctrl.getFeatureStatus);
internalOfferwallRouter.get("/offers", requireAuth, gate, limiter, ctrl.getOffers);
internalOfferwallRouter.post(
  "/offers/:offerId/start",
  requireAuth,
  gate,
  writeLimiter,
  requireCriticalIdempotency({ scope: "internal_offerwall_start" }),
  ctrl.postStart,
);
internalOfferwallRouter.post(
  "/attempts/:attemptId/partner-opened",
  requireAuth,
  gate,
  writeLimiter,
  requireCriticalIdempotency({ scope: "internal_offerwall_partner_opened" }),
  ctrl.postPartnerOpened,
);
internalOfferwallRouter.post(
  "/attempts/:attemptId/submit",
  requireAuth,
  gate,
  writeLimiter,
  requireCriticalIdempotency({ scope: "internal_offerwall_submit" }),
  ctrl.postSubmit,
);
internalOfferwallRouter.post(
  "/attempts/:attemptId/abandon",
  requireAuth,
  gate,
  writeLimiter,
  requireCriticalIdempotency({ scope: "internal_offerwall_abandon" }),
  ctrl.postAbandon,
);
