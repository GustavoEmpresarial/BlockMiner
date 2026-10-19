import { Suspense, useEffect } from 'react';
import { lazyWithRetry } from '../shared/utils/lazyWithRetry';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useAuthStore } from '../shared/auth/auth.store';
import { startSiteIntegrityMonitoring } from '../features/antibot';
import CookieConsentBanner from '../shared/components/CookieConsentBanner';
import ScrollToTopOnNav from '../shared/components/ScrollToTopOnNav';
import { LandingPage } from '../features/landing/index';
import { LoginPage, RegisterPage } from '../features/auth';
import TransparencyErrorBoundary from '../shared/components/TransparencyErrorBoundary';
import { DashboardPage } from '../features/dashboard/index';
import { ProtectedLayout, ProtectedNoLayout } from '../features/shell/index';
// These four are already lazy inside features/admin/index — wrapping them again broke /admin/dashboard (React #306).
import {
  AdminLayout,
  AdminOverviewPage,
  AdminAnalyticsPage,
  AdminTrafficStatsPage,
  AdminMetricsPage,
  adminFeatureRoutes,
} from '../features/admin/index';

// Pages load on demand (the entry chunk was 765 KB gzip with all 40+ pages and the whole admin).
// Entry points a visitor lands on first stay in the main bundle.
const ForgotPasswordPage = lazyWithRetry(() => import('../features/forgot-password').then((m) => ({ default: m.ForgotPasswordPage })));
const VerifyEmailPage = lazyWithRetry(() => import('../features/verify-email').then((m) => ({ default: m.VerifyEmailPage })));
const TermsOfUsePage = lazyWithRetry(() => import('../features/legal').then((m) => ({ default: m.TermsOfUsePage })));
const PrivacyPolicyPage = lazyWithRetry(() => import('../features/legal').then((m) => ({ default: m.PrivacyPolicyPage })));
const CookiePolicyPage = lazyWithRetry(() => import('../features/legal').then((m) => ({ default: m.CookiePolicyPage })));
const RankingPage = lazyWithRetry(() => import('../features/ranking/index').then((m) => ({ default: m.RankingPage })));
const PublicRoomPage = lazyWithRetry(() => import('../features/public-room/index').then((m) => ({ default: m.PublicRoomPage })));
const SocialPage = lazyWithRetry(() => import('../features/social/index').then((m) => ({ default: m.SocialPage })));
const CreatorPage = lazyWithRetry(() => import('../features/creator/index').then((m) => ({ default: m.CreatorPage })));
const ReferralsPage = lazyWithRetry(() => import('../features/referrals/index').then((m) => ({ default: m.ReferralsPage })));
const ManualPage = lazyWithRetry(() => import('../features/manual/index').then((m) => ({ default: m.ManualPage })));
const CalculatorPage = lazyWithRetry(() => import('../features/calculator/index').then((m) => ({ default: m.CalculatorPage })));
const RoadmapPage = lazyWithRetry(() => import('../features/roadmap/index').then((m) => ({ default: m.RoadmapPage })));
const TransparencyPage = lazyWithRetry(() => import('../features/transparency/index').then((m) => ({ default: m.TransparencyPage })));
const VaultPage = lazyWithRetry(() => import('../features/machines/index').then((m) => ({ default: m.VaultPage })));
const Inventory2Page = lazyWithRetry(() => import('../features/inventory2/index').then((m) => ({ default: m.Inventory2Page })));
const MergePage = lazyWithRetry(() => import('../features/parts/index').then((m) => ({ default: m.MergePage })));
const StatsPage = lazyWithRetry(() => import('../features/stats/index').then((m) => ({ default: m.StatsPage })));
const InventarioPage = lazyWithRetry(() => import('../features/inventario/index').then((m) => ({ default: m.InventarioPage })));
const ShopPage = lazyWithRetry(() => import('../features/shop/index').then((m) => ({ default: m.ShopPage })));
const OffersPage = lazyWithRetry(() => import('../features/offers/index').then((m) => ({ default: m.OffersPage })));
const WalletPage = lazyWithRetry(() => import('../features/wallet/index').then((m) => ({ default: m.WalletPage })));
const TaxesPage = lazyWithRetry(() => import('../features/taxes/index').then((m) => ({ default: m.TaxesPage })));
const PowerBoostDocsPage = lazyWithRetry(() => import('../features/taxes/index').then((m) => ({ default: m.PowerBoostDocsPage })));
const SupportPage = lazyWithRetry(() => import('../features/support/index').then((m) => ({ default: m.SupportPage })));
const SettingsPage = lazyWithRetry(() => import('../features/settings/index').then((m) => ({ default: m.SettingsPage })));
const CheckinPage = lazyWithRetry(() => import('../features/checkin/index').then((m) => ({ default: m.CheckinPage })));
const TasksPage = lazyWithRetry(() => import('../features/tasks/index').then((m) => ({ default: m.TasksPage })));
const MiniPassPage = lazyWithRetry(() => import('../features/mini-pass/index').then((m) => ({ default: m.MiniPassPage })));
const TournamentsPage = lazyWithRetry(() => import('../features/tournaments/index').then((m) => ({ default: m.TournamentsPage })));
const GamesPage = lazyWithRetry(() => import('../features/games/index').then((m) => ({ default: m.GamesPage })));
const GameSessionPage = lazyWithRetry(() => import('../features/games/index').then((m) => ({ default: m.GameSessionPage })));
const Game2048Page = lazyWithRetry(() => import('../features/games/index').then((m) => ({ default: m.Game2048Page })));
const GameVerifyPage = lazyWithRetry(() => import('../features/games/index').then((m) => ({ default: m.GameVerifyPage })));
const FaucetPage = lazyWithRetry(() => import('../features/faucet/index').then((m) => ({ default: m.FaucetPage })));
const InternalOfferwallPage = lazyWithRetry(() => import('../features/internal-offerwall/index').then((m) => ({ default: m.InternalOfferwallPage })));
const OfferwallPage = lazyWithRetry(() => import('../features/offerwall/index').then((m) => ({ default: m.OfferwallPage })));
const PtcViewPage = lazyWithRetry(() => import('../features/ptc/index').then((m) => ({ default: m.PtcViewPage })));
const PtcCampaignsPage = lazyWithRetry(() => import('../features/ptc/index').then((m) => ({ default: m.PtcCampaignsPage })));
const ShortlinksPage = lazyWithRetry(() => import('../features/shortlinks/index').then((m) => ({ default: m.ShortlinksPage })));
const ShortlinkStepPage = lazyWithRetry(() => import('../features/shortlinks/index').then((m) => ({ default: m.ShortlinkStepPage })));
const PasteadDonePage = lazyWithRetry(() => import('../features/shortlinks/index').then((m) => ({ default: m.PasteadDonePage })));
const PasteadFailedPage = lazyWithRetry(() => import('../features/shortlinks/index').then((m) => ({ default: m.PasteadFailedPage })));
const AdlinkflyDonePage = lazyWithRetry(() => import('../features/shortlinks/index').then((m) => ({ default: m.AdlinkflyDonePage })));
const AdlinkflyFailedPage = lazyWithRetry(() => import('../features/shortlinks/index').then((m) => ({ default: m.AdlinkflyFailedPage })));
const ReadEarnPage = lazyWithRetry(() => import('../features/read-earn/index').then((m) => ({ default: m.ReadEarnPage })));
const YouTubeWatchPage = lazyWithRetry(() => import('../features/youtube/index').then((m) => ({ default: m.YouTubeWatchPage })));
const AutoMiningPage = lazyWithRetry(() => import('../features/auto-mining/index').then((m) => ({ default: m.AutoMiningPage })));
const BurnEventsPage = lazyWithRetry(() => import('../features/burn-events/index').then((m) => ({ default: m.BurnEventsPage })));
const AdminLoginPage = lazyWithRetry(() => import('../features/admin-auth/index').then((m) => ({ default: m.AdminLoginPage })));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

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
      <ScrollToTopOnNav />
      <Suspense fallback={<RouteFallback />}>
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
          <Route path="/merge" element={<MergePage />} />
          <Route path="/parts" element={<Navigate to="/merge" replace />} />
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
      </Suspense>
      <CookieConsentBanner />
    </BrowserRouter>
  );
}
