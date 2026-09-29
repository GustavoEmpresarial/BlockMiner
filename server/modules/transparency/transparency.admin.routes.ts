import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import { requireAdminPermission } from "../admin/admin.permissions.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import * as transparencyController from "./transparency.controller.js";

export const transparencyAdminRouter = express.Router();

transparencyAdminRouter.use(requireAdminAuth);

const readLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 120,
  name: "transparency_admin_read",
});

const writeLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 300,
  name: "transparency_admin_write",
});

// ─── Transparency Entries (Despesas & Receitas) ──────────────────────────────
transparencyAdminRouter.get(
  "/transparency",
  readLimiter,
  requireAdminPermission("transparency.view"),
  transparencyController.adminList,
);
transparencyAdminRouter.post(
  "/transparency",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminCreate,
);
transparencyAdminRouter.put(
  "/transparency/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminUpdate,
);
transparencyAdminRouter.patch(
  "/transparency/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminUpdate,
);
transparencyAdminRouter.delete(
  "/transparency/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminDelete,
);

// ─── Treasury Wallet Settings & Activity ────────────────────────────────────
transparencyAdminRouter.get(
  "/transparency/wallet/settings",
  readLimiter,
  requireAdminPermission("transparency.view"),
  transparencyController.adminWalletGetSettings,
);
transparencyAdminRouter.put(
  "/transparency/wallet/settings",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminWalletPutSettings,
);
transparencyAdminRouter.get(
  "/transparency/wallet/activity",
  readLimiter,
  requireAdminPermission("transparency.view"),
  transparencyController.adminWalletGetActivity,
);

// ─── Tracked Wallets ────────────────────────────────────────────────────────
transparencyAdminRouter.get(
  "/transparency/tracked-wallets",
  readLimiter,
  requireAdminPermission("transparency.view"),
  transparencyController.adminTrackedWalletList,
);
transparencyAdminRouter.post(
  "/transparency/tracked-wallets",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminTrackedWalletCreate,
);
transparencyAdminRouter.get(
  "/transparency/tracked-wallets/activity",
  readLimiter,
  requireAdminPermission("transparency.view"),
  transparencyController.adminTrackedWalletActivity,
);
transparencyAdminRouter.put(
  "/transparency/tracked-wallets/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminTrackedWalletUpdate,
);
transparencyAdminRouter.patch(
  "/transparency/tracked-wallets/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminTrackedWalletUpdate,
);
transparencyAdminRouter.delete(
  "/transparency/tracked-wallets/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminTrackedWalletDelete,
);

// ─── External Investments ("Outros Investimentos") ───────────────────────────
transparencyAdminRouter.get(
  "/transparency/external-investments",
  readLimiter,
  requireAdminPermission("transparency.view"),
  transparencyController.adminExternalInvestmentList,
);
transparencyAdminRouter.get(
  "/transparency/external-investments/:id",
  readLimiter,
  requireAdminPermission("transparency.view"),
  transparencyController.adminExternalInvestmentGet,
);
transparencyAdminRouter.post(
  "/transparency/external-investments",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminExternalInvestmentCreate,
);
transparencyAdminRouter.put(
  "/transparency/external-investments/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminExternalInvestmentUpdate,
);
transparencyAdminRouter.patch(
  "/transparency/external-investments/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminExternalInvestmentUpdate,
);
transparencyAdminRouter.delete(
  "/transparency/external-investments/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminExternalInvestmentDelete,
);

// ─── Hardware Assets (ASIC Mining) ──────────────────────────────────────────
transparencyAdminRouter.get(
  "/transparency/hardware-assets",
  readLimiter,
  requireAdminPermission("transparency.view"),
  transparencyController.adminHardwareAssetList,
);
transparencyAdminRouter.post(
  "/transparency/hardware-assets",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminHardwareAssetCreate,
);
transparencyAdminRouter.put(
  "/transparency/hardware-assets/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminHardwareAssetUpdate,
);
transparencyAdminRouter.patch(
  "/transparency/hardware-assets/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminHardwareAssetUpdate,
);
transparencyAdminRouter.delete(
  "/transparency/hardware-assets/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminHardwareAssetDelete,
);

// ─── Hardware Profit Logs & BTC Price ───────────────────────────────────────
transparencyAdminRouter.get(
  "/transparency/btc-usd-price",
  readLimiter,
  requireAdminPermission("transparency.view"),
  transparencyController.adminBtcUsdPrice,
);
transparencyAdminRouter.get(
  "/transparency/hardware-assets/:assetId/profit-logs",
  readLimiter,
  requireAdminPermission("transparency.view"),
  transparencyController.adminHardwareProfitLogList,
);
transparencyAdminRouter.post(
  "/transparency/hardware-assets/:assetId/profit-logs",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminHardwareProfitLogCreate,
);
transparencyAdminRouter.put(
  "/transparency/hardware-assets/:assetId/profit-logs/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminHardwareProfitLogUpdate,
);
transparencyAdminRouter.patch(
  "/transparency/hardware-assets/:assetId/profit-logs/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminHardwareProfitLogUpdate,
);
transparencyAdminRouter.delete(
  "/transparency/hardware-assets/:assetId/profit-logs/:id",
  writeLimiter,
  requireAdminPermission("transparency"),
  transparencyController.adminHardwareProfitLogDelete,
);
