/** Admin routes for the internal offerwall (offers CRUD, attempt approval, frame hosts).
 *  Ported from legacy/server/modules/internal-offerwall/internal-offerwall.admin.routes.ts.
 *  Mounted under /api/admin, guarded by requireAdminAuth, dedicated rate limiter and RBAC.
 *  Full paths /api/admin/internal-offerwall/* unchanged. */
import express from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import * as adminCtrl from "./internal-offerwall.admin.controller.js";

export const internalOfferwallAdminRouter = express.Router();

const adminLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 300,
  name: "admin_internal_offerwall",
  keyGenerator: (req) => `admin_ip:${getClientIp(req)}`,
  secondaryKeyGenerator: (req) => (req.admin?.adminId ? `admin:${req.admin.adminId}` : null),
});

internalOfferwallAdminRouter.use(requireAdminAuth);
internalOfferwallAdminRouter.use(adminLimiter);

const viewGuard = requireAdminPermission(
  "internal_offerwall.view",
  "internal_offerwall",
  "offerwall.view",
  "offerwall",
);
const manageGuard = requireAdminPermission("internal_offerwall", "offerwall");

internalOfferwallAdminRouter.get("/internal-offerwall/offers", viewGuard, adminCtrl.listOffers);
internalOfferwallAdminRouter.post("/internal-offerwall/offers", manageGuard, adminCtrl.createOffer);
internalOfferwallAdminRouter.put("/internal-offerwall/offers/:id", manageGuard, adminCtrl.patchOffer);
internalOfferwallAdminRouter.patch("/internal-offerwall/offers/:id", manageGuard, adminCtrl.patchOffer);
internalOfferwallAdminRouter.get("/internal-offerwall/attempts", viewGuard, adminCtrl.listAttempts);
internalOfferwallAdminRouter.post("/internal-offerwall/attempts/:id/approve", manageGuard, adminCtrl.approveAttempt);
internalOfferwallAdminRouter.post("/internal-offerwall/attempts/:id/reject", manageGuard, adminCtrl.rejectAttempt);
internalOfferwallAdminRouter.get("/internal-offerwall/frame-hosts", viewGuard, adminCtrl.listFrameHosts);
internalOfferwallAdminRouter.delete("/internal-offerwall/frame-hosts/:id", manageGuard, adminCtrl.deactivateFrameHost);
