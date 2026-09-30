/** Admin financial routes — fused from legacy modules/finance/ (finance.admin.routes.ts,
 *  withdrawalAdmin.controller.ts). Mounted inside adminRouter → inherits admin auth. */
import express from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import * as withdrawalController from "./withdrawal/withdrawal.controller.js";

export const walletAdminRouter = express.Router();

walletAdminRouter.use(requireAdminAuth);

const readLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 120,
  name: "finance_admin_read",
});

const writeLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 300,
  name: "finance_admin_write",
});

walletAdminRouter.get(
  "/wallet/withdrawals/pending",
  readLimiter,
  requireAdminPermission("withdrawals", "finance"),
  withdrawalController.adminListPendingWithdrawals,
);

walletAdminRouter.get(
  "/wallet/hot-wallet",
  readLimiter,
  requireAdminPermission("withdrawals", "finance"),
  withdrawalController.adminGetHotWalletStatus,
);

walletAdminRouter.post(
  "/wallet/hot-wallet/clear-cooldown",
  writeLimiter,
  requireAdminPermission("withdrawals"),
  withdrawalController.adminClearHotWalletCooldown,
);

walletAdminRouter.post(
  "/wallet/withdrawals/:withdrawalId/approve",
  writeLimiter,
  requireAdminPermission("withdrawals"),
  withdrawalController.adminApproveWithdrawal,
);

walletAdminRouter.post(
  "/wallet/withdrawals/:withdrawalId/reject",
  writeLimiter,
  requireAdminPermission("withdrawals"),
  withdrawalController.adminRejectWithdrawal,
);

walletAdminRouter.post(
  "/wallet/withdrawals/:withdrawalId/complete",
  writeLimiter,
  requireAdminPermission("withdrawals"),
  withdrawalController.adminCompleteWithdrawal,
);
