import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import * as miningAdminController from "./mining.admin.controller.js";
// Mounted inside adminRouter → inherits requireAdminAuth + adminLimiter there; also applied
// directly here so this router is self-contained if mounted standalone (matches wallet.admin.routes.ts).
export const miningAdminRouter = express.Router();
miningAdminRouter.use(requireAdminAuth);
miningAdminRouter.post("/mining/blk-cycle/run", miningAdminController.adminTriggerBlockCycle);
// Distinct from the block-cycle route above: this one runs the BLK-token reward-distribution
// engine (mining.blk-cycle.ts), not POL block settlement. Manual-only, same as legacy.
miningAdminRouter.post("/mining/blk-reward-cycle/run", miningAdminController.adminTriggerBlkCycle);
