/**
 * Ported from legacy/server/modules/checkin/checkin.routes.ts, incl. the
 * `requireVisibleSidebarPath` operational kill switch (sidebar-nav Fase 8).
 */
import { Router } from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import { requireVisibleSidebarPath, sidebarRegistryPath, SIDEBAR_ITEM_REGISTRY } from "../sidebar-nav/index.js";
import * as checkinController from "./checkin.controller.js";

export const checkinRouter = Router();

const statusLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
const confirmLimiter = createRateLimiter({ windowMs: 60_000, max: 25 });
const recoveryLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
const checkinPath = sidebarRegistryPath(SIDEBAR_ITEM_REGISTRY.checkin.path, "checkin");
const gate = requireVisibleSidebarPath(checkinPath);

checkinRouter.get("/status", requireAuth, gate, statusLimiter, checkinController.getStatus);
checkinRouter.get("/rewards", requireAuth, gate, statusLimiter, checkinController.getCheckinRewards);
checkinRouter.get("/history", requireAuth, gate, statusLimiter, checkinController.getCheckinHistory);
checkinRouter.post("/claim", requireAuth, gate, confirmLimiter, checkinController.claimCheckin);
checkinRouter.post("/claim/onchain", requireAuth, gate, confirmLimiter, checkinController.claimCheckinOnchain);
checkinRouter.post("/confirm", requireAuth, gate, confirmLimiter, checkinController.confirmCheckin);
checkinRouter.post("/wallet", requireAuth, gate, confirmLimiter, checkinController.checkinWallet);
checkinRouter.post("/balance", requireAuth, gate, confirmLimiter, checkinController.checkinBalance);

checkinRouter.get("/streak-recovery/status", requireAuth, recoveryLimiter, checkinController.getStreakRecoveryStatus);
checkinRouter.post("/streak-recovery/pay", requireAuth, recoveryLimiter, checkinController.payStreakRecovery);
