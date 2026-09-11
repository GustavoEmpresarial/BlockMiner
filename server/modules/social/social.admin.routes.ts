import express from "express";
import { requireAdminAuth } from "../admin/admin.auth.middleware.js";
import * as adminSocial from "./social.admin.controller.js";

/**
 * Admin routes for Social + Creators.
 * Paths: /api/admin/social/*, /api/admin/creators/*
 */
export const socialAdminRouter = express.Router();
socialAdminRouter.use(requireAdminAuth);

socialAdminRouter.get("/social/credential-requests", adminSocial.listCredentialRequests);
socialAdminRouter.post("/social/credential-requests/:id/approve", adminSocial.approveCredential);
socialAdminRouter.post("/social/credential-requests/:id/reject", adminSocial.rejectCredential);
socialAdminRouter.get("/social/profiles", adminSocial.listProfiles);
socialAdminRouter.post("/social/profiles", adminSocial.createProfile);
socialAdminRouter.put("/social/profiles/:id", adminSocial.updateProfile);
socialAdminRouter.delete("/social/profiles/:id", adminSocial.deleteProfile);
socialAdminRouter.get("/social/submissions", adminSocial.listSubmissions);
socialAdminRouter.post("/social/submissions/:id/approve", adminSocial.approveSubmission);
socialAdminRouter.post("/social/submissions/:id/reject", adminSocial.rejectSubmission);
socialAdminRouter.delete("/social/submissions/:id", adminSocial.deleteSubmission);
socialAdminRouter.get("/social/reward-settings", adminSocial.getRewardSettings);
socialAdminRouter.put("/social/reward-settings", adminSocial.setRewardSettings);

socialAdminRouter.get("/creators", adminSocial.adminListCreators);
socialAdminRouter.get("/creators/search", adminSocial.adminSearchCreators);
socialAdminRouter.put("/creators/:id", adminSocial.adminUpsertCreator);
socialAdminRouter.delete("/creators/:id", adminSocial.adminRemoveCreator);
