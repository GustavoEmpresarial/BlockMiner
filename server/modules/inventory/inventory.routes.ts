/**
 * Ported from legacy/server/modules/inventory/inventory.routes.ts.
 *
 * Only GET / (list) lives here now. The former POST /install, /remove and /update
 * routes were dead code — the real, currently-used install/uninstall flow is
 * rooms/rooms.routes.ts's POST /rooms/rack/install|uninstall, which the client
 * actually calls (see Inventory2Page.tsx). This module's own install/remove had
 * diverged from that flow: it wrote a bare UserMiner row keyed by slotIndex with
 * no UserRack link at all, so a machine "installed" through it would never appear
 * in any rack UI while still (as far as the mining engine is concerned) mining —
 * a rack-capacity bypass, not just dead code. Removed rather than fixed forward,
 * since rooms/ already owns this responsibility correctly.
 */
import express from "express";
import { requireAuth } from "../../core/http/middleware/auth.js";
import * as inventoryController from "./inventory.controller.js";
export const inventoryRouter = express.Router();
inventoryRouter.get("/", requireAuth, inventoryController.getInventory);
