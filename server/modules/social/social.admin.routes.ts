import express from "express";
import { requireAdminAuth, requireAdminPermission } from "../admin/index.js";
import { createRateLimiter } from "../../core/http/middleware/rateLimit.js";
import * as adminSocial from "./social.admin.controller.js";

/**
 * Admin routes for Social + Creators.
 * Paths: /api/admin/social/*, /api/admin/creators/*
 *
 * RBAC:
 * - Read endpoints require 'creators.view' (or 'creators', 'promotions', 'users.view', 'users', '*')
 * - Write/Mutation endpoints require 'creators' (or 'promotions', 'users', '*')
 */
export const socialAdminRouter = express.Router();

const socialLimiter = createRateLimiter({ windowMs: 60_000, max: 120 });
socialAdminRouter.use(requireAdminAuth, socialLimiter);

// Credential requests
socialAdminRouter.get(
  "/social/credential-requests",
  requireAdminPermission("creators.view", "creators", "promotions", "users.view", "users"),
  adminSocial.listCredentialRequests
);
socialAdminRouter.post(
  "/social/credential-requests/:id/approve",
  requireAdminPermission("creators", "promotions", "users"),
  adminSocial.approveCredential
);
socialAdminRouter.post(
  "/social/credential-requests/:id/reject",
  requireAdminPermission("creators", "promotions", "users"),
  adminSocial.rejectCredential
);

// Profiles
socialAdminRouter.get(
  "/social/profiles",
  requireAdminPermission("creators.view", "creators", "promotions", "users.view", "users"),
  adminSocial.listProfiles
);
socialAdminRouter.post(
  "/social/profiles",
  requireAdminPermission("creators", "promotions", "users"),
  adminSocial.createProfile
);
socialAdminRouter.put(
  "/social/profiles/:id",
  requireAdminPermission("creators", "promotions", "users"),
  adminSocial.updateProfile
);
socialAdminRouter.delete(
  "/social/profiles/:id",
  requireAdminPermission("creators", "promotions", "users"),
  adminSocial.deleteProfile
);

// Submissions
socialAdminRouter.get(
  "/social/submissions",
  requireAdminPermission("creators.view", "creators", "promotions", "users.view", "users"),
  adminSocial.listSubmissions
);
socialAdminRouter.post(
  "/social/submissions/:id/approve",
  requireAdminPermission("creators", "promotions", "users"),
  adminSocial.approveSubmission
);
socialAdminRouter.post(
  "/social/submissions/:id/reject",
  requireAdminPermission("creators", "promotions", "users"),
  adminSocial.rejectSubmission
);
socialAdminRouter.delete(
  "/social/submissions/:id",
  requireAdminPermission("creators", "promotions", "users"),
  adminSocial.deleteSubmission
);

// Reward Settings
socialAdminRouter.get(
  "/social/reward-settings",
  requireAdminPermission("creators.view", "creators", "promotions", "users.view", "users"),
  adminSocial.getRewardSettings
);
socialAdminRouter.put(
  "/social/reward-settings",
  requireAdminPermission("creators", "promotions", "users"),
  adminSocial.setRewardSettings
);

// Creators flag
socialAdminRouter.get(
  "/creators",
  requireAdminPermission("creators.view", "creators", "promotions", "users.view", "users"),
  adminSocial.adminListCreators
);
socialAdminRouter.get(
  "/creators/search",
  requireAdminPermission("creators.view", "creators", "promotions", "users.view", "users"),
  adminSocial.adminSearchCreators
);
socialAdminRouter.put(
  "/creators/:id",
  requireAdminPermission("creators", "promotions", "users"),
  adminSocial.adminUpsertCreator
);
socialAdminRouter.delete(
  "/creators/:id",
  requireAdminPermission("creators", "promotions", "users"),
  adminSocial.adminRemoveCreator
);
