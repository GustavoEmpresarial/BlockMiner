import express from "express";
import { requireAdminAuth } from "../admin/index.js";
import * as transparencyController from "./transparency.controller.js";

export const transparencyAdminRouter = express.Router();

transparencyAdminRouter.use(requireAdminAuth);

transparencyAdminRouter.get("/transparency", transparencyController.adminList);
transparencyAdminRouter.post("/transparency", transparencyController.adminCreate);
transparencyAdminRouter.get("/transparency/wallet/settings", transparencyController.adminWalletGetSettings);
transparencyAdminRouter.put("/transparency/wallet/settings", transparencyController.adminWalletPutSettings);
transparencyAdminRouter.get("/transparency/wallet/activity", transparencyController.adminWalletGetActivity);
transparencyAdminRouter.get("/transparency/tracked-wallets", transparencyController.adminTrackedWalletList);
transparencyAdminRouter.post("/transparency/tracked-wallets", transparencyController.adminTrackedWalletCreate);
transparencyAdminRouter.get("/transparency/tracked-wallets/activity", transparencyController.adminTrackedWalletActivity);
transparencyAdminRouter.put("/transparency/tracked-wallets/:id", transparencyController.adminTrackedWalletUpdate);
transparencyAdminRouter.delete("/transparency/tracked-wallets/:id", transparencyController.adminTrackedWalletDelete);
transparencyAdminRouter.put("/transparency/:id", transparencyController.adminUpdate);
transparencyAdminRouter.delete("/transparency/:id", transparencyController.adminDelete);

transparencyAdminRouter.get("/transparency/external-investments", transparencyController.adminExternalInvestmentList);
transparencyAdminRouter.post("/transparency/external-investments", transparencyController.adminExternalInvestmentCreate);
transparencyAdminRouter.put("/transparency/external-investments/:id", transparencyController.adminExternalInvestmentUpdate);
transparencyAdminRouter.delete("/transparency/external-investments/:id", transparencyController.adminExternalInvestmentDelete);

transparencyAdminRouter.get("/transparency/hardware-assets", transparencyController.adminHardwareAssetList);
transparencyAdminRouter.post("/transparency/hardware-assets", transparencyController.adminHardwareAssetCreate);
transparencyAdminRouter.put("/transparency/hardware-assets/:id", transparencyController.adminHardwareAssetUpdate);
transparencyAdminRouter.delete("/transparency/hardware-assets/:id", transparencyController.adminHardwareAssetDelete);

transparencyAdminRouter.get("/transparency/btc-usd-price", transparencyController.adminBtcUsdPrice);
transparencyAdminRouter.get(
  "/transparency/hardware-assets/:assetId/profit-logs",
  transparencyController.adminHardwareProfitLogList,
);
transparencyAdminRouter.post(
  "/transparency/hardware-assets/:assetId/profit-logs",
  transparencyController.adminHardwareProfitLogCreate,
);
transparencyAdminRouter.put(
  "/transparency/hardware-assets/:assetId/profit-logs/:id",
  transparencyController.adminHardwareProfitLogUpdate,
);
transparencyAdminRouter.delete(
  "/transparency/hardware-assets/:assetId/profit-logs/:id",
  transparencyController.adminHardwareProfitLogDelete,
);
