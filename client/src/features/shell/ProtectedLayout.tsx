import { Suspense, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../shared/auth/auth.store';
import { useGameStore } from './lib/game.store';
import TopNav from './components/TopNav';
import BroadcastPopup from './broadcast/BroadcastPopup';
import PtcSessionManager from '../ptc/components/PtcSessionManager';
import ShortlinkBackgroundRunner from '../shortlinks/components/ShortlinkBackgroundRunner';
import AutoMiningBackgroundRunner from '../auto-mining/components/AutoMiningBackgroundRunner';
import SiteFooter from '../../shared/components/SiteFooter';
import EmailVerifyBanner from '../verify-email/EmailVerifyBanner';

export default function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authHydrated = useAuthStore((s) => s.authHydrated);
  const checkSession = useAuthStore((s) => s.checkSession);
  const initSocket = useGameStore((s) => s.initSocket);
  const location = useLocation();
  const fullWidth = location.pathname === '/inventory';

  useEffect(() => {
    void checkSession({ silent: true });
  }, [checkSession]);

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  if (!authHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-white">
      <TopNav />
      <div className="flex min-w-0 flex-1 flex-col pt-16 pb-20 lg:pb-0">
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 supports-[padding:max(0px)]:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className={fullWidth ? 'mx-auto w-full max-w-none' : 'mx-auto w-full max-w-7xl'}>
            <div className="sticky top-20 z-20">
              <EmailVerifyBanner />
            </div>
            <Suspense
              fallback={
                <div className="flex min-h-[40vh] items-center justify-center">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
        <SiteFooter />
      </div>
      <BroadcastPopup />
      <PtcSessionManager />
      <ShortlinkBackgroundRunner />
      <AutoMiningBackgroundRunner />
    </div>
  );
}
