/** Ported from legacy/server/modules/shop/shop.routes.ts. */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { requireCriticalIdempotency } from "../../core/http/middleware/idempotency.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import * as shopController from "./shop.controller.js";

export const shopRouter = express.Router();

const shopLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 10,
  name: "shop_purchase",
  keyGenerator: (req) => `ip:${getClientIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});

shopRouter.get("/miners", requireAuth, shopController.listMiners);
shopRouter.post(
  "/purchase",
  requireAuth,
  shopLimiter,
  requireCriticalIdempotency({ scope: "shop_purchase" }),
  shopController.purchaseMiner,
);
shopRouter.post(
  "/purchase-fan",
  requireAuth,
  shopLimiter,
  requireCriticalIdempotency({ scope: "shop_purchase_fan" }),
  shopController.purchaseFan,
);
shopRouter.post(
  "/purchase-rack",
  requireAuth,
  shopLimiter,
  requireCriticalIdempotency({ scope: "shop_purchase_rack" }),
  shopController.purchaseRack,
);
