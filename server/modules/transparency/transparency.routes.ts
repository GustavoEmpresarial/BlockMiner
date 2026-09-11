import express from "express";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as transparencyController from "./transparency.controller.js";

export const transparencyRouter = express.Router();

const publicLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });

// Legacy public surface mounts GET /api/transparency (root) — see
// legacy/backend/src/app/mount/publicSurfaceRoutes.mount.ts. Keep `/entries`
// as an explicit alias for callers that prefer a resource path.
transparencyRouter.get("/", publicLimiter, transparencyController.getPublicEntries);
transparencyRouter.get("/entries", publicLimiter, transparencyController.getPublicEntries);
transparencyRouter.get("/withdrawal-stats", publicLimiter, transparencyController.getPublicWithdrawalStats);
transparencyRouter.get("/wallet-stats", publicLimiter, transparencyController.getPublicWalletStats);
transparencyRouter.get("/wallets-live", publicLimiter, transparencyController.getPublicTrackedWalletsLive);
transparencyRouter.get("/external-investments", publicLimiter, transparencyController.getPublicExternalInvestments);
transparencyRouter.get("/hardware-assets", publicLimiter, transparencyController.getPublicHardwareAssets);
