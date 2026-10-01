import express, { type Router } from "express";
import { requireAdminAuth } from "../admin/index.js";
import { requireAdminPermission } from "../admin/admin.permissions.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import * as usersAdminController from "./users.admin.controller.js";

export const usersAdminRouter: Router = express.Router();

usersAdminRouter.use(requireAdminAuth);

const readLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 120,
  name: "users_admin_read",
});

const writeLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 60,
  name: "users_admin_write",
});

const balanceLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 30,
  name: "users_admin_balance",
});

const passwordLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 10,
  name: "users_admin_password",
});

// Read routes
usersAdminRouter.get(
  "/users",
  readLimiter,
  requireAdminPermission("users.view", "users"),
  usersAdminController.listUsersHandler
);

usersAdminRouter.get(
  "/users/:id",
  readLimiter,
  requireAdminPermission("users.view", "users"),
  usersAdminController.getUserDetailHandler
);

usersAdminRouter.get(
  "/users/:id/tickets",
  readLimiter,
  requireAdminPermission("users.view", "users"),
  usersAdminController.getUserTicketsHandler
);

usersAdminRouter.get(
  "/users/:id/related",
  readLimiter,
  requireAdminPermission("users.view", "users"),
  usersAdminController.getRelatedUsersHandler
);

usersAdminRouter.get(
  "/users/:id/wallet-ledger",
  readLimiter,
  requireAdminPermission("users.view", "users"),
  usersAdminController.getUserWalletLedgerHandler
);

usersAdminRouter.get(
  "/users/:id/activity-summary",
  readLimiter,
  requireAdminPermission("users.view", "users"),
  usersAdminController.getUserActivitySummaryHandler
);

// Ban/Unban routes (users.ban or users)
usersAdminRouter.put(
  "/users/:id/ban",
  writeLimiter,
  requireAdminPermission("users.ban", "users"),
  usersAdminController.banUserHandler
);

usersAdminRouter.post(
  "/users/:id/ban",
  writeLimiter,
  requireAdminPermission("users.ban", "users"),
  usersAdminController.banUserHandler
);

usersAdminRouter.post(
  "/users/:id/unban",
  writeLimiter,
  requireAdminPermission("users.ban", "users"),
  usersAdminController.unbanUserHandler
);

// High-privilege mutation routes (requires "users")
usersAdminRouter.post(
  "/users/:id/adjust-balance",
  balanceLimiter,
  requireAdminPermission("users"),
  usersAdminController.adjustBalanceHandler
);

usersAdminRouter.post(
  "/users/:id/unlock",
  writeLimiter,
  requireAdminPermission("users"),
  usersAdminController.unlockUserHandler
);

usersAdminRouter.post(
  "/users/:id/reset-password",
  passwordLimiter,
  requireAdminPermission("users"),
  usersAdminController.resetUserPasswordHandler
);

usersAdminRouter.post(
  "/users/:id/send-miner",
  writeLimiter,
  requireAdminPermission("users"),
  usersAdminController.sendMinerHandler
);
