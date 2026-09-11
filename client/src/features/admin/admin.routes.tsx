import type { ReactNode } from 'react';
import { Route } from 'react-router-dom';
import AdminAntibotPage from './antibot/AdminAntibotPage';
import AdminFraudSignalsPage from './fraud-signals/AdminFraudSignalsPage';
import AdminPublicSupportPage from './support/AdminPublicSupportPage';
import AdminSupportPage from './support/AdminSupportPage';
import AdminUserSidebarPage from './sidebar-nav/AdminUserSidebarPage';
import AdminClientErrorsPage from './client-errors/AdminClientErrorsPage';
import AdminBackupsPage from './backups/AdminBackupsPage';
import AdminBroadcastPage from './broadcast/AdminBroadcastPage';
import AdminAdminsPage from './admins/AdminAdminsPage';
import AdminAuditLogPage from './admin-audit/AdminAuditLogPage';
import AdminProfilePage from './profile/AdminProfilePage';
import AdminFinancePage from './finance/AdminFinancePage';
import AdminTransparencyPage from './transparency/AdminTransparencyPage';
import AdminTransparencyExternalInvestmentsPage from './transparency/AdminTransparencyExternalInvestmentsPage';
import AdminBurnEventsPage from './burn-events/AdminBurnEventsPage';
import AdminMiniPassPage from './mini-pass/AdminMiniPassPage';
import AdminMiniPassSeasonPage from './mini-pass/AdminMiniPassSeasonPage';
import AdminAntibotUserProfilePage from './antibot/AdminAntibotUserProfilePage';
import AdminCheckinMilestonesPage from './checkin/AdminCheckinMilestonesPage';
import AdminOfferEventsPage from './offer-events/AdminOfferEventsPage';
import AdminOfferEventManagePage from './offer-events/AdminOfferEventManagePage';
import AdminInternalOfferwallPage from './internal-offerwall/AdminInternalOfferwallPage';
import AdminOfferwallAnalyticsPage from './offerwall-analytics/AdminOfferwallAnalyticsPage';
import AdminDailyTasksPage from './tasks/AdminDailyTasksPage';
import AdminPtcPage from './ptc/AdminPtcPage';
import AdminReadEarnPage from './read-earn/AdminReadEarnPage';
import AdminTournamentsPage from './tournaments/AdminTournamentsPage';
import AdminBannersPage from './banners/AdminBannersPage';
import AdminCreatorsPage from './creators/AdminCreatorsPage';
import AdminLogsPage from './logs/AdminLogsPage';
import AdminMinersPage from './miners/AdminMinersPage';
import AdminSalaPage from './sala/AdminSalaPage';
import AdminFaucetPage from './faucet/AdminFaucetPage';
import AdminAiHealthPage from './ai-health/AdminAiHealthPage';
import AdminUsersPage from './users/AdminUsersPage';
import AdminUserDetailPage from './users/AdminUserDetailPage';

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
    <Route path="/admin/sala" element={<AdminSalaPage />} />
    <Route path="/admin/faucet" element={<AdminFaucetPage />} />
    <Route path="/admin/ai-health" element={<AdminAiHealthPage />} />
  </>
);
