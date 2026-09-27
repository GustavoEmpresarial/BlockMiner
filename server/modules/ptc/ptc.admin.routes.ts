/** Ported from legacy/server/modules/ptc/ptc.routes.ts (admin router half). Full paths /api/admin/ptc/* unchanged. */
import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import * as adminCtrl from "./ptc.admin.controller.js";

export const ptcAdminRouter = express.Router();

ptcAdminRouter.use(requireAdminAuth);
ptcAdminRouter.get("/ptc/settings", adminCtrl.getSettings);
ptcAdminRouter.put("/ptc/settings", adminCtrl.updateSettings);
ptcAdminRouter.get("/ptc/campaigns/pending", adminCtrl.listPending);
ptcAdminRouter.get("/ptc/campaigns", adminCtrl.listAll);
ptcAdminRouter.post("/ptc/campaigns/:id/approve", adminCtrl.approve);
ptcAdminRouter.post("/ptc/campaigns/:id/reject", adminCtrl.reject);
ptcAdminRouter.get("/ptc/tiers", adminCtrl.getTiers);
ptcAdminRouter.post("/ptc/tiers", adminCtrl.createTier);
ptcAdminRouter.put("/ptc/tiers/:id", adminCtrl.updateTier);
ptcAdminRouter.delete("/ptc/tiers/:id", adminCtrl.deleteTier);
