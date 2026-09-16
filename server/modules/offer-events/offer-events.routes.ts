import { Router } from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { requireCriticalIdempotency } from "../../core/http/middleware/idempotency.js";
import { validateBody } from "../../core/http/middleware/validate.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import * as ctrl from "./offer-events.controller.js";
import { purchaseSchema } from "./offer-events.schemas.js";

export const offerEventsRouter = Router();

const listLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 120,
  name: "offer_events_list",
});
const purchaseLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 20,
  name: "offer_events_purchase",
  keyGenerator: (req) => `ip:${getClientIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});

offerEventsRouter.get("/active", requireAuth, listLimiter, ctrl.listActiveOfferEvents);
offerEventsRouter.post(
  "/purchase",
  requireAuth,
  purchaseLimiter,
  validateBody(purchaseSchema),
  requireCriticalIdempotency({ scope: "offer_event_purchase" }),
  ctrl.purchaseOfferMiner,
);
offerEventsRouter.post(
  "/purchase-fan",
  requireAuth,
  purchaseLimiter,
  requireCriticalIdempotency({ scope: "offer_event_purchase_fan" }),
  ctrl.purchaseFanOffer,
);
offerEventsRouter.post(
  "/purchase-rack",
  requireAuth,
  purchaseLimiter,
  requireCriticalIdempotency({ scope: "offer_event_purchase_rack" }),
  ctrl.purchaseRackOffer,
);
