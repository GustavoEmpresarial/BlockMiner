/** Ported from legacy/server/modules/inventory/inventory.routes.ts. */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { requireCriticalIdempotency } from "../../core/http/middleware/idempotency.js";
import * as inventoryController from "./inventory.controller.js";
export const inventoryRouter = express.Router();
const inventoryLimiter = createDistributedRateLimiter({ windowMs: 60_000, max: 20, name: "inventory_write" });
inventoryRouter.get("/", requireAuth, inventoryController.getInventory);
inventoryRouter.post("/install", requireAuth, inventoryLimiter, requireCriticalIdempotency({ scope: "inventory_install" }), inventoryController.installInventoryItem);
inventoryRouter.post("/remove", requireAuth, inventoryLimiter, requireCriticalIdempotency({ scope: "inventory_remove" }), inventoryController.removeInventoryItem);
inventoryRouter.post("/update", requireAuth, inventoryLimiter, inventoryController.updateInventory);
