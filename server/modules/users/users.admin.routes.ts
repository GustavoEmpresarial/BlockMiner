import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as usersAdminController from "./users.admin.controller.js";

export const usersAdminRouter = express.Router();

usersAdminRouter.use(requireAdminAuth);

usersAdminRouter.get("/users", usersAdminController.listUsersHandler);
usersAdminRouter.get("/users/:id", usersAdminController.getUserDetailHandler);
usersAdminRouter.get("/users/:id/tickets", usersAdminController.getUserTicketsHandler);
usersAdminRouter.get("/users/:id/related", usersAdminController.getRelatedUsersHandler);
usersAdminRouter.put("/users/:id/ban", usersAdminController.banUserHandler);
usersAdminRouter.post("/users/:id/ban", usersAdminController.banUserHandler);
usersAdminRouter.post("/users/:id/unban", usersAdminController.unbanUserHandler);
usersAdminRouter.post("/users/:id/adjust-balance", usersAdminController.adjustBalanceHandler);
usersAdminRouter.post("/users/:id/unlock", usersAdminController.unlockUserHandler);
usersAdminRouter.post("/users/:id/reset-password", createRateLimiter({ windowMs: 60_000, max: 10 }), usersAdminController.resetUserPasswordHandler);
usersAdminRouter.post("/users/:id/send-miner", usersAdminController.sendMinerHandler);
usersAdminRouter.get("/users/:id/wallet-ledger", usersAdminController.getUserWalletLedgerHandler);
usersAdminRouter.get("/users/:id/activity-summary", usersAdminController.getUserActivitySummaryHandler);
