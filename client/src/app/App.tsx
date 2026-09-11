import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../shared/auth/auth.store';
import { startSiteIntegrityMonitoring } from '../features/antibot';
import CookieConsentBanner from '../shared/components/CookieConsentBanner';
import { LandingPage } from '../features/landing/index';
import { LoginPage, RegisterPage } from '../features/auth';
import { ForgotPasswordPage } from '../features/forgot-password';
import { VerifyEmailPage } from '../features/verify-email';
import { TermsOfUsePage, PrivacyPolicyPage, CookiePolicyPage } from '../features/legal';
import { RankingPage } from '../features/ranking/index';
import { PublicRoomPage } from '../features/public-room/index';
import { SocialPage } from '../features/social/index';
import { CreatorPage } from '../features/creator/index';
import { ReferralsPage } from '../features/referrals/index';
import { ManualPage } from '../features/manual/index';
import { CalculatorPage } from '../features/calculator/index';
import { RoadmapPage } from '../features/roadmap/index';
import { TransparencyPage } from '../features/transparency/index';
import TransparencyErrorBoundary from '../shared/components/TransparencyErrorBoundary';
import { DashboardPage } from '../features/dashboard/index';
import { VaultPage } from '../features/machines/index';
import { Inventory2Page } from '../features/inventory2/index';
import { StatsPage } from '../features/stats/index';
import { InventarioPage } from '../features/inventario/index';
import { ShopPage } from '../features/shop/index';
import { OffersPage } from '../features/offers/index';
import { WalletPage } from '../features/wallet/index';
import { TaxesPage, PowerBoostDocsPage } from '../features/taxes/index';
import { SupportPage } from '../features/support/index';
import { SettingsPage } from '../features/settings/index';
import { CheckinPage } from '../features/checkin/index';
import { TasksPage } from '../features/tasks/index';
import { MiniPassPage } from '../features/mini-pass/index';
import { TournamentsPage } from '../features/tournaments/index';
import { GamesPage, GameSessionPage, Game2048Page, GameVerifyPage } from '../features/games/index';
import { FaucetPage } from '../features/faucet/index';
import { InternalOfferwallPage } from '../features/internal-offerwall/index';
import { OfferwallPage } from '../features/offerwall/index';
import { PtcViewPage, PtcCampaignsPage } from '../features/ptc/index';
import {
  ShortlinksPage,
  ShortlinkStepPage,
  PasteadDonePage,
  PasteadFailedPage,
  AdlinkflyDonePage,
  AdlinkflyFailedPage,
} from '../features/shortlinks/index';
import { ReadEarnPage } from '../features/read-earn/index';
import { YouTubeWatchPage } from '../features/youtube/index';
import { AutoMiningPage } from '../features/auto-mining/index';
import { BurnEventsPage } from '../features/burn-events/index';
import { ProtectedLayout, ProtectedNoLayout } from '../features/shell/index';
import { AdminLoginPage } from '../features/admin-auth/index';
import {
  AdminLayout,
  AdminOverviewPage,
  AdminAnalyticsPage,
  AdminTrafficStatsPage,
  AdminMetricsPage,
  adminFeatureRoutes,
} from '../features/admin/index';

function ShortlinkStepRoute() {
  const { step } = useParams();
  return <ShortlinkStepPage key={step ?? '1'} />;
}

export default function App() {
  const checkSession = useAuthStore((s) => s.checkSession);
  const userId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  // Site-wide integrity beacons (F12 / Tampermonkey / native API hooks) — only while logged in.
  useEffect(() => {
    if (!userId) return;
    return startSiteIntegrityMonitoring();
  }, [userId]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/terms-of-use" element={<TermsOfUsePage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/cookie-policy" element={<CookiePolicyPage />} />

        {/* Admin — separate session (admin_session cookie), not the regular ProtectedLayout. */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<AdminOverviewPage />} />
          <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
          <Route path="/admin/traffic" element={<AdminTrafficStatsPage />} />
          <Route path="/admin/metrics" element={<AdminMetricsPage />} />
          {adminFeatureRoutes}
        </Route>

        <Route element={<ProtectedNoLayout />}>
          <Route path="/games/:slug" element={<GameSessionPage />} />
        </Route>

        <Route element={<ProtectedLayout />}>
          {/* Principal */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/inventory" element={<Inventory2Page />} />
          <Route path="/inventory2" element={<Inventory2Page />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/power-stats" element={<StatsPage />} />
          <Route path="/inventario" element={<InventarioPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/offers" element={<OffersPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/taxes" element={<TaxesPage />} />
          <Route path="/taxes/power-boost" element={<PowerBoostDocsPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Ganhar */}
          <Route path="/tournaments" element={<TournamentsPage />} />
          <Route path="/checkin" element={<CheckinPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/daily-tasks" element={<Navigate to="/tasks" replace />} />
          <Route path="/mini-pass" element={<MiniPassPage />} />
          <Route path="/mini-pass/:seasonId" element={<MiniPassPage />} />
          <Route path="/burn" element={<BurnEventsPage />} />
          <Route path="/games" element={<GamesPage />} />
          <Route path="/games/2048" element={<Game2048Page />} />
          <Route path="/games/verify" element={<GameVerifyPage />} />
          <Route path="/minigame" element={<Navigate to="/games" replace />} />

          {/* Recompensas */}
          <Route path="/faucet" element={<FaucetPage />} />
          <Route path="/internal-offerwall" element={<InternalOfferwallPage />} />
          <Route path="/offerwall" element={<OfferwallPage />} />
          <Route path="/offerwall-zerads" element={<Navigate to="/offerwall" replace />} />
          <Route path="/offerwallme" element={<Navigate to="/offerwall" replace />} />
          <Route path="/ptc" element={<PtcViewPage />} />
          <Route path="/ptc/campaigns" element={<PtcCampaignsPage />} />
          <Route path="/shortlinks" element={<ShortlinksPage />} />
          <Route path="/shortlinks/pastead/done" element={<PasteadDonePage />} />
          <Route path="/shortlinks/pastead/failed" element={<PasteadFailedPage />} />
          <Route path="/shortlinks/adlinkfly/done" element={<AdlinkflyDonePage />} />
          <Route path="/shortlinks/adlinkfly/failed" element={<AdlinkflyFailedPage />} />
          <Route path="/shortlink/internal-shortlink/step/:step" element={<ShortlinkStepRoute />} />
          <Route path="/read-earn" element={<ReadEarnPage />} />
          <Route path="/youtube" element={<YouTubeWatchPage />} />
          <Route path="/auto-mining" element={<AutoMiningPage />} />

          {/* Social & Fun */}
          <Route path="/social" element={<SocialPage />} />
          <Route path="/creator" element={<CreatorPage />} />
          <Route path="/referrals" element={<ReferralsPage />} />
          <Route path="/manual" element={<ManualPage />} />
          <Route path="/calculator" element={<CalculatorPage />} />
          <Route path="/ranking" element={<RankingPage />} />
          <Route path="/room/:username" element={<PublicRoomPage />} />
          <Route path="/roadmap" element={<RoadmapPage />} />
          <Route
            path="/transparency"
            element={
              <TransparencyErrorBoundary>
                <TransparencyPage />
              </TransparencyErrorBoundary>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <CookieConsentBanner />
    </BrowserRouter>
  );
}
