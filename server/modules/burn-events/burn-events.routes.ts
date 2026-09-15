import { Router } from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { requireCriticalIdempotency } from "../../core/http/middleware/idempotency.js";
import { validateBody, validateParams } from "../../core/http/middleware/validate.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import {
  BURN_READ_RATE_LIMIT_MAX,
  BURN_READ_RATE_LIMIT_WINDOW_MS,
  BURN_WRITE_RATE_LIMIT_MAX,
  BURN_WRITE_RATE_LIMIT_WINDOW_MS,
} from "./burn-events.config.js";
import * as ctrl from "./burn-events.controller.js";
import {
  claimBurnBodySchema,
  eventIdParamSchema,
  startBurnBodySchema,
} from "./burn-events.schemas.js";

export const burnEventsRouter = Router();

burnEventsRouter.use(requireAuth);

const readLimiter = createDistributedRateLimiter({
  windowMs: BURN_READ_RATE_LIMIT_WINDOW_MS,
  max: BURN_READ_RATE_LIMIT_MAX,
  name: "burn_events_read",
});
const writeLimiter = createDistributedRateLimiter({
  windowMs: BURN_WRITE_RATE_LIMIT_WINDOW_MS,
  max: BURN_WRITE_RATE_LIMIT_MAX,
  name: "burn_events_write",
  keyGenerator: (req) => `ip:${getClientIp(req)}`,
  secondaryKeyGenerator: (req) => (req.user?.id ? `uid:${req.user.id}` : null),
});

burnEventsRouter.get("/", readLimiter, ctrl.listActive);
burnEventsRouter.get("/my-machines", readLimiter, ctrl.myMachines);
burnEventsRouter.get(
  "/:id/session",
  readLimiter,
  validateParams(eventIdParamSchema),
  ctrl.pendingSession,
);
burnEventsRouter.post(
  "/:id/start",
  writeLimiter,
  validateParams(eventIdParamSchema),
  validateBody(startBurnBodySchema),
  requireCriticalIdempotency({ scope: "burn_event_start" }),
  ctrl.start,
);
burnEventsRouter.post(
  "/:id/claim",
  writeLimiter,
  validateParams(eventIdParamSchema),
  validateBody(claimBurnBodySchema),
  requireCriticalIdempotency({ scope: "burn_event_claim" }),
  ctrl.claim,
);
