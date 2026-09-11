/** Admin financial routes — fused from legacy modules/finance/ (finance.admin.routes.ts,
 *  withdrawalAdmin.controller.ts). Mounted inside adminRouter → inherits admin auth. */
import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import * as withdrawalController from "./withdrawal/withdrawal.controller.js";

export const walletAdminRouter = express.Router();

walletAdminRouter.use(requireAdminAuth);

walletAdminRouter.get("/wallet/withdrawals/pending", withdrawalController.adminListPendingWithdrawals);
walletAdminRouter.get("/wallet/hot-wallet", withdrawalController.adminGetHotWalletStatus);
walletAdminRouter.post("/wallet/withdrawals/:withdrawalId/approve", withdrawalController.adminApproveWithdrawal);
walletAdminRouter.post("/wallet/withdrawals/:withdrawalId/reject", withdrawalController.adminRejectWithdrawal);
walletAdminRouter.post("/wallet/withdrawals/:withdrawalId/complete", withdrawalController.adminCompleteWithdrawal);
