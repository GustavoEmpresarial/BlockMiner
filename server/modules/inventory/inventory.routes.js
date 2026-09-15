/**
 * Ported from legacy/server/modules/inventory/inventory.routes.ts.
 *
 * Only GET / (list) lives here now. The former POST /install, /remove and /update
 * routes were dead code — the real install/uninstall flow is
 * rooms/rooms.routes.ts. Stale compiled inventory.routes.js used to keep those
 * dangerous endpoints reachable; this file must stay in lockstep with
 * inventory.routes.ts.
 */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import * as inventoryController from "./inventory.controller.js";
export const inventoryRouter = express.Router();
inventoryRouter.get("/", requireAuth, inventoryController.getInventory);
