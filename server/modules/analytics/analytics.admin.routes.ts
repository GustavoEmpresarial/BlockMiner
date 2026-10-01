/**
 * Admin analytics routes.
 * Mounted at /api/admin, protected by requireAdminAuth, analyticsLimiter, and requireAdminPermission.
 */
import express from 'express';
import { requireAdminAuth, requireAdminPermission } from '../admin/index.js';
import { createRateLimiter } from '../../core/http/middleware/rateLimit.js';
import { validateQuery } from '../../core/http/middleware/validate.js';
import { analyticsQuerySchema, executiveQuerySchema } from './analytics.schemas.js';
import {
  getStats,
  getAnalytics,
  getExecutive,
  getInflation,
  getProjections,
  getWithdrawalStats,
  getDistribution,
} from './analytics.admin.controller.js';

export const analyticsAdminRouter = express.Router();

const analyticsLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  name: 'analytics_admin',
});

const analyticsPermissionGuard = requireAdminPermission(
  'dashboard',
  'finance',
  'monitoring'
);

analyticsAdminRouter.use(requireAdminAuth, analyticsLimiter, analyticsPermissionGuard);

analyticsAdminRouter.get('/stats', getStats);
analyticsAdminRouter.get('/analytics/executive', validateQuery(executiveQuerySchema), getExecutive);
analyticsAdminRouter.get('/analytics', validateQuery(analyticsQuerySchema), getAnalytics);
analyticsAdminRouter.get(
  '/analytics/inflation',
  validateQuery(analyticsQuerySchema),
  getInflation
);
analyticsAdminRouter.get(
  '/analytics/projections',
  validateQuery(analyticsQuerySchema),
  getProjections
);
analyticsAdminRouter.get(
  '/analytics/withdrawals',
  validateQuery(analyticsQuerySchema),
  getWithdrawalStats
);
analyticsAdminRouter.get(
  '/analytics/distribution',
  validateQuery(analyticsQuerySchema),
  getDistribution
);
