/** Admin financial routes — fused from legacy modules/finance/ (finance.admin.routes.ts,
 *  withdrawalAdmin.controller.ts). Mounted inside adminRouter → inherits admin auth. */
import express from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import * as withdrawalController from "./withdrawal/withdrawal.controller.js";

export const walletAdminRouter = express.Router();

walletAdminRouter.use(requireAdminAuth);

walletAdminRouter.get(
  "/wallet/withdrawals/pending",
  requireAdminPermission("withdrawals", "finance"),
  withdrawalController.adminListPendingWithdrawals,
);

walletAdminRouter.get(
  "/wallet/hot-wallet",
  requireAdminPermission("withdrawals", "finance"),
  withdrawalController.adminGetHotWalletStatus,
);

walletAdminRouter.post(
  "/wallet/hot-wallet/clear-cooldown",
  requireAdminPermission("withdrawals"),
  withdrawalController.adminClearHotWalletCooldown,
);

walletAdminRouter.post(
  "/wallet/withdrawals/:withdrawalId/approve",
  requireAdminPermission("withdrawals"),
  withdrawalController.adminApproveWithdrawal,
);

walletAdminRouter.post(
  "/wallet/withdrawals/:withdrawalId/reject",
  requireAdminPermission("withdrawals"),
  withdrawalController.adminRejectWithdrawal,
);

walletAdminRouter.post(
  "/wallet/withdrawals/:withdrawalId/complete",
  requireAdminPermission("withdrawals"),
  withdrawalController.adminCompleteWithdrawal,
);
