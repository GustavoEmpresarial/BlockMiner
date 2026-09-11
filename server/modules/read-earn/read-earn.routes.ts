/**
 * Ported from legacy/server/modules/read-earn/read-earn.routes.ts, incl. the
 * `requireVisibleSidebarPath` operational kill switch (sidebar-nav Fase 8).
 */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { requireVisibleSidebarPath, sidebarRegistryPath, SIDEBAR_ITEM_REGISTRY } from "../sidebar-nav/index.js";
import * as readEarnController from "./read-earn.controller.js";

export const readEarnRouter = express.Router();

const redeemLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: "Too many redeem attempts. Try again later." });
const readEarnPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.read_earn.path, "read_earn");

readEarnRouter.get("/campaigns", requireVisibleSidebarPath(readEarnPath), readEarnController.getPublicReadEarnCampaigns);
readEarnRouter.post(
  "/redeem",
  requireAuth,
  requireVisibleSidebarPath(readEarnPath),
  redeemLimiter,
  readEarnController.postReadEarnRedeem,
);
