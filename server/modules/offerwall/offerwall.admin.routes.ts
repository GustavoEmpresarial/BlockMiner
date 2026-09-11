/**
 * Ported from legacy/server/modules/offerwall/offerwall.admin.routes.ts.
 * Admin analytics for offerwall conversions (internal + offerwall.me + Zerads).
 * Mounted inside the shared /api/admin prefix → inherits requireAdminAuth (see wallet.admin.routes.ts
 * for the identical `.use(requireAdminAuth)` pattern this module follows).
 */
import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import { getOfferwallAnalytics } from "./offerwall.admin.controller.js";

export const offerwallAdminRouter = express.Router();

offerwallAdminRouter.use(requireAdminAuth);

offerwallAdminRouter.get("/offerwall/analytics", getOfferwallAnalytics);
