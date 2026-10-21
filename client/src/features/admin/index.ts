import { lazyWithRetry } from '../../shared/utils/lazyWithRetry';
export { default as AdminLayout } from './AdminLayout';
export const AdminOverviewPage = lazyWithRetry(() => import('./overview/AdminOverviewPage'));
export const AdminAnalyticsPage = lazyWithRetry(() => import('./analytics/AdminAnalyticsPage'));
export const AdminTrafficStatsPage = lazyWithRetry(() => import('./traffic/AdminTrafficStatsPage'));
export const AdminMetricsPage = lazyWithRetry(() => import('./metrics/AdminMetricsPage'));
export { adminFeatureRoutes } from './admin.routes';
