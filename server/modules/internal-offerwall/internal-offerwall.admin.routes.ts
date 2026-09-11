/** Admin routes for the internal offerwall (offers CRUD, attempt approval, frame hosts).
 *  Ported from legacy/server/modules/internal-offerwall/internal-offerwall.admin.routes.ts.
 *  Mounted under /api/admin, guarded by requireAdminAuth — same pattern as
 *  wallet.admin.routes.ts / faucet.admin.routes.ts. Full paths /api/admin/internal-offerwall/*
 *  unchanged. */
import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import * as adminCtrl from "./internal-offerwall.admin.controller.js";

export const internalOfferwallAdminRouter = express.Router();
internalOfferwallAdminRouter.use(requireAdminAuth);

internalOfferwallAdminRouter.get("/internal-offerwall/offers", adminCtrl.listOffers);
internalOfferwallAdminRouter.post("/internal-offerwall/offers", adminCtrl.createOffer);
internalOfferwallAdminRouter.patch("/internal-offerwall/offers/:id", adminCtrl.patchOffer);
internalOfferwallAdminRouter.get("/internal-offerwall/attempts", adminCtrl.listAttempts);
internalOfferwallAdminRouter.post("/internal-offerwall/attempts/:id/approve", adminCtrl.approveAttempt);
internalOfferwallAdminRouter.post("/internal-offerwall/attempts/:id/reject", adminCtrl.rejectAttempt);
internalOfferwallAdminRouter.get("/internal-offerwall/frame-hosts", adminCtrl.listFrameHosts);
internalOfferwallAdminRouter.delete("/internal-offerwall/frame-hosts/:id", adminCtrl.deactivateFrameHost);
