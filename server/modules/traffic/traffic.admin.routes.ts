/** Ported from legacy/server/modules/traffic/traffic.admin.routes.ts. Full paths /api/admin/traffic/* unchanged. */
import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import {
  adminGetTrafficByDomain,
  adminGetTrafficByUtm,
  adminGetTrafficDaily,
  adminGetTrafficSummary,
} from "./traffic.admin.controller.js";

export const trafficAdminRouter = express.Router();
trafficAdminRouter.use(requireAdminAuth);

trafficAdminRouter.get("/traffic/summary", adminGetTrafficSummary);
trafficAdminRouter.get("/traffic/by-domain", adminGetTrafficByDomain);
trafficAdminRouter.get("/traffic/by-utm", adminGetTrafficByUtm);
trafficAdminRouter.get("/traffic/daily", adminGetTrafficDaily);
