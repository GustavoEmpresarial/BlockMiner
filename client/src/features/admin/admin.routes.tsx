import type { ReactNode } from 'react';
import { Route } from 'react-router-dom';
import { lazyWithRetry } from '../../shared/utils/lazyWithRetry';
const AdminAntibotPage = lazyWithRetry(() => import('./antibot/AdminAntibotPage'));
const AdminFraudSignalsPage = lazyWithRetry(() => import('./fraud-signals/AdminFraudSignalsPage'));
const AdminPublicSupportPage = lazyWithRetry(() => import('./support/AdminPublicSupportPage'));
const AdminSupportPage = lazyWithRetry(() => import('./support/AdminSupportPage'));
const AdminUserSidebarPage = lazyWithRetry(() => import('./sidebar-nav/AdminUserSidebarPage'));
const AdminClientErrorsPage = lazyWithRetry(() => import('./client-errors/AdminClientErrorsPage'));
const AdminBackupsPage = lazyWithRetry(() => import('./backups/AdminBackupsPage'));
const AdminBroadcastPage = lazyWithRetry(() => import('./broadcast/AdminBroadcastPage'));
const AdminAdminsPage = lazyWithRetry(() => import('./admins/AdminAdminsPage'));
const AdminAuditLogPage = lazyWithRetry(() => import('./admin-audit/AdminAuditLogPage'));
const AdminProfilePage = lazyWithRetry(() => import('./profile/AdminProfilePage'));
const AdminFinancePage = lazyWithRetry(() => import('./finance/AdminFinancePage'));
const AdminTransparencyPage = lazyWithRetry(() => import('./transparency/AdminTransparencyPage'));
const AdminTransparencyExternalInvestmentsPage = lazyWithRetry(() => import('./transparency/AdminTransparencyExternalInvestmentsPage'));
const AdminBurnEventsPage = lazyWithRetry(() => import('./burn-events/AdminBurnEventsPage'));
const AdminMiniPassPage = lazyWithRetry(() => import('./mini-pass/AdminMiniPassPage'));
const AdminMiniPassSeasonPage = lazyWithRetry(() => import('./mini-pass/AdminMiniPassSeasonPage'));
const AdminAntibotUserProfilePage = lazyWithRetry(() => import('./antibot/AdminAntibotUserProfilePage'));
const AdminCheckinMilestonesPage = lazyWithRetry(() => import('./checkin/AdminCheckinMilestonesPage'));
const AdminOfferEventsPage = lazyWithRetry(() => import('./offer-events/AdminOfferEventsPage'));
const AdminOfferEventManagePage = lazyWithRetry(() => import('./offer-events/AdminOfferEventManagePage'));
const AdminInternalOfferwallPage = lazyWithRetry(() => import('./internal-offerwall/AdminInternalOfferwallPage'));
const AdminOfferwallAnalyticsPage = lazyWithRetry(() => import('./offerwall-analytics/AdminOfferwallAnalyticsPage'));
const AdminDailyTasksPage = lazyWithRetry(() => import('./tasks/AdminDailyTasksPage'));
const AdminPtcPage = lazyWithRetry(() => import('./ptc/AdminPtcPage'));
const AdminReadEarnPage = lazyWithRetry(() => import('./read-earn/AdminReadEarnPage'));
const AdminTournamentsPage = lazyWithRetry(() => import('./tournaments/AdminTournamentsPage'));
const AdminBannersPage = lazyWithRetry(() => import('./banners/AdminBannersPage'));
const AdminCreatorsPage = lazyWithRetry(() => import('./creators/AdminCreatorsPage'));
const AdminLogsPage = lazyWithRetry(() => import('./logs/AdminLogsPage'));
const AdminMinersPage = lazyWithRetry(() => import('./miners/AdminMinersPage'));
const AdminFaucetPage = lazyWithRetry(() => import('./faucet/AdminFaucetPage'));
const AdminUsersPage = lazyWithRetry(() => import('./users/AdminUsersPage'));
const AdminUserDetailPage = lazyWithRetry(() => import('./users/AdminUserDetailPage'));

/** Route elements intended for the existing authenticated AdminLayout route. */
export const adminFeatureRoutes: ReactNode = (
  <>
    <Route path="/admin/users" element={<AdminUsersPage />} />
    <Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
    <Route path="/admin/fraud-signals" element={<AdminFraudSignalsPage />} />
    <Route path="/admin/antibot" element={<AdminAntibotPage />} />
    <Route path="/admin/support" element={<AdminSupportPage />} />
    <Route path="/admin/public-support" element={<AdminPublicSupportPage />} />
    <Route path="/admin/user-sidebar" element={<AdminUserSidebarPage />} />
    <Route path="/admin/client-errors" element={<AdminClientErrorsPage />} />
    <Route path="/admin/backups" element={<AdminBackupsPage />} />
    <Route path="/admin/broadcast" element={<AdminBroadcastPage />} />
    <Route path="/admin/admins" element={<AdminAdminsPage />} />
    <Route path="/admin/admin-audit" element={<AdminAuditLogPage />} />
    <Route path="/admin/profile" element={<AdminProfilePage />} />
    <Route path="/admin/finance" element={<AdminFinancePage />} />
    <Route path="/admin/transparency" element={<AdminTransparencyPage />} />
    <Route path="/admin/transparency/investments" element={<AdminTransparencyExternalInvestmentsPage />} />
    <Route path="/admin/burn-events" element={<AdminBurnEventsPage />} />
    <Route path="/admin/mini-pass" element={<AdminMiniPassPage />} />
    <Route path="/admin/mini-pass/:seasonId" element={<AdminMiniPassSeasonPage />} />
    <Route path="/admin/antibot/users/:id" element={<AdminAntibotUserProfilePage />} />
    <Route path="/admin/checkin-milestones" element={<AdminCheckinMilestonesPage />} />
    <Route path="/admin/offer-events" element={<AdminOfferEventsPage />} />
    <Route path="/admin/offer-events/:id" element={<AdminOfferEventManagePage />} />
    <Route path="/admin/internal-offerwall" element={<AdminInternalOfferwallPage />} />
    <Route path="/admin/offerwall-analytics" element={<AdminOfferwallAnalyticsPage />} />
    <Route path="/admin/daily-tasks" element={<AdminDailyTasksPage />} />
    <Route path="/admin/ptc" element={<AdminPtcPage />} />
    <Route path="/admin/read-earn" element={<AdminReadEarnPage />} />
    <Route path="/admin/tournaments" element={<AdminTournamentsPage />} />
    <Route path="/admin/banners" element={<AdminBannersPage />} />
    <Route path="/admin/creators" element={<AdminCreatorsPage />} />
    <Route path="/admin/logs" element={<AdminLogsPage />} />
    <Route path="/admin/miners" element={<AdminMinersPage />} />
    <Route path="/admin/faucet" element={<AdminFaucetPage />} />
  </>
);
