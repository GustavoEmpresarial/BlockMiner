import { Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { validateBody, validateParams, validateQuery } from "../../core/http/middleware/validate.js";
import {
  BURN_ADMIN_WRITE_RATE_LIMIT_MAX,
  BURN_ADMIN_WRITE_RATE_LIMIT_WINDOW_MS,
  BURN_READ_RATE_LIMIT_MAX,
  BURN_READ_RATE_LIMIT_WINDOW_MS,
} from "./burn-events.config.js";
import * as ctrl from "./burn-events.admin.controller.js";
import {
  adminClaimsQuerySchema,
  adminCreateBurnEventSchema,
  adminUpdateBurnEventSchema,
  eventIdParamSchema,
} from "./burn-events.schemas.js";

export const burnEventsAdminRouter = Router();

burnEventsAdminRouter.use(requireAdminAuth);

const readLimiter = createDistributedRateLimiter({
  windowMs: BURN_READ_RATE_LIMIT_WINDOW_MS,
  max: BURN_READ_RATE_LIMIT_MAX,
  name: "burn_events_admin_read",
});
const writeLimiter = createDistributedRateLimiter({
  windowMs: BURN_ADMIN_WRITE_RATE_LIMIT_WINDOW_MS,
  max: BURN_ADMIN_WRITE_RATE_LIMIT_MAX,
  name: "burn_events_admin_write",
});

burnEventsAdminRouter.get("/", readLimiter, ctrl.listAll);
burnEventsAdminRouter.post("/", writeLimiter, validateBody(adminCreateBurnEventSchema), ctrl.create);
burnEventsAdminRouter.put(
  "/:id",
  writeLimiter,
  validateParams(eventIdParamSchema),
  validateBody(adminUpdateBurnEventSchema),
  ctrl.update,
);
burnEventsAdminRouter.delete(
  "/:id",
  writeLimiter,
  validateParams(eventIdParamSchema),
  ctrl.remove,
);
burnEventsAdminRouter.get(
  "/:id/claims",
  readLimiter,
  validateParams(eventIdParamSchema),
  validateQuery(adminClaimsQuerySchema),
  ctrl.claims,
);
