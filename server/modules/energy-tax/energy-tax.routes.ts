import { Router } from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { requireCriticalIdempotency } from "../../core/http/middleware/idempotency.js";
import * as ctrl from "./energy-tax.controller.js";

export const energyTaxRouter = Router();

const summaryLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const payLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

energyTaxRouter.get("/summary", requireAuth, summaryLimiter, ctrl.getSummary);
energyTaxRouter.post(
  "/pay-daily",
  requireAuth,
  payLimiter,
  requireCriticalIdempotency({ scope: "energy_tax_pay_daily" }),
  ctrl.postPayDaily,
);
