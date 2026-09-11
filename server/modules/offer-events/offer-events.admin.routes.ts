// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
import { Router } from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import * as adminOffer from "./offer-events.admin.controller.js";
/** Mount under `/api/admin` — paths include `/offer-events...` (legacy layout). */
export const offerEventsAdminRouter = Router();
offerEventsAdminRouter.use(requireAdminAuth);
offerEventsAdminRouter.get("/offer-events", adminOffer.adminListOfferEvents);
offerEventsAdminRouter.post("/offer-events", adminOffer.adminCreateOfferEvent);
offerEventsAdminRouter.get("/offer-events/:id", adminOffer.adminGetOfferEvent);
offerEventsAdminRouter.put("/offer-events/:id", adminOffer.adminUpdateOfferEvent);
offerEventsAdminRouter.delete("/offer-events/:id", adminOffer.adminSoftDeleteOfferEvent);
offerEventsAdminRouter.get("/offer-events/:eventId/miners", adminOffer.adminListEventMiners);
offerEventsAdminRouter.post("/offer-events/:eventId/miners", adminOffer.adminCreateEventMiner);
offerEventsAdminRouter.put("/offer-events/:eventId/miners/:minerId", adminOffer.adminUpdateEventMiner);
offerEventsAdminRouter.delete("/offer-events/:eventId/miners/:minerId", adminOffer.adminRemoveEventMiner);
offerEventsAdminRouter.get("/offer-events/:id/purchases", adminOffer.adminListEventPurchases);
