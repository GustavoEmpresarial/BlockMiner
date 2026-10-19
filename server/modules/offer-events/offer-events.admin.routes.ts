import { Router } from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import { createDistributedRateLimiter } from "../../core/http/middleware/distributedRateLimit.js";
import { getClientIp } from "../../shared/http/clientIp.js";
import * as adminOffer from "./offer-events.admin.controller.js";
import { invalidateActiveOfferEventsCache } from "./offer-events.service.js";

/** Mount under `/api/admin` — paths include `/offer-events...` (legacy layout). */
export const offerEventsAdminRouter = Router();

const adminLimiter = createDistributedRateLimiter({
  windowMs: 60_000,
  max: 300,
  name: "admin_offer_events",
  keyGenerator: (req) => `admin_ip:${getClientIp(req)}`,
  secondaryKeyGenerator: (req) => (req.admin?.adminId ? `admin:${req.admin.adminId}` : null),
});

offerEventsAdminRouter.use(requireAdminAuth);
offerEventsAdminRouter.use(adminLimiter);
// Any admin write to events/miners must show up on the next sidebar poll, not after the cache TTL.
offerEventsAdminRouter.use("/offer-events", (req, res, next) => {
  if (req.method !== "GET") res.on("finish", invalidateActiveOfferEventsCache);
  next();
});

const viewGuard = requireAdminPermission("events.view", "events");
const manageGuard = requireAdminPermission("events");

offerEventsAdminRouter.get("/offer-events", viewGuard, adminOffer.adminListOfferEvents);
offerEventsAdminRouter.post("/offer-events", manageGuard, adminOffer.adminCreateOfferEvent);
offerEventsAdminRouter.get("/offer-events/:id", viewGuard, adminOffer.adminGetOfferEvent);
offerEventsAdminRouter.put("/offer-events/:id", manageGuard, adminOffer.adminUpdateOfferEvent);
offerEventsAdminRouter.patch("/offer-events/:id", manageGuard, adminOffer.adminUpdateOfferEvent);
offerEventsAdminRouter.delete("/offer-events/:id", manageGuard, adminOffer.adminSoftDeleteOfferEvent);

offerEventsAdminRouter.get("/offer-events/:eventId/miners", viewGuard, adminOffer.adminListEventMiners);
offerEventsAdminRouter.post("/offer-events/:eventId/miners", manageGuard, adminOffer.adminCreateEventMiner);
offerEventsAdminRouter.put("/offer-events/:eventId/miners/:minerId", manageGuard, adminOffer.adminUpdateEventMiner);
offerEventsAdminRouter.patch("/offer-events/:eventId/miners/:minerId", manageGuard, adminOffer.adminUpdateEventMiner);
offerEventsAdminRouter.delete("/offer-events/:eventId/miners/:minerId", manageGuard, adminOffer.adminRemoveEventMiner);

offerEventsAdminRouter.get("/offer-events/:id/purchases", viewGuard, adminOffer.adminListEventPurchases);
