import { Router } from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { getRewardInbox, collectReward, collectAllRewards } from "./reward-inbox.controller.js";

export const rewardInboxRouter = Router();
rewardInboxRouter.get("/", requireAuth, getRewardInbox);
rewardInboxRouter.post("/collect-all", requireAuth, collectAllRewards);
rewardInboxRouter.post("/:id/collect", requireAuth, collectReward);
