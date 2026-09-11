import { Suspense, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../shared/auth/auth.store';
import { useGameStore } from './lib/game.store';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import BroadcastPopup from './broadcast/BroadcastPopup';
import PtcSessionManager from '../ptc/components/PtcSessionManager';
import ShortlinkBackgroundRunner from '../shortlinks/components/ShortlinkBackgroundRunner';
import AutoMiningBackgroundRunner from '../auto-mining/components/AutoMiningBackgroundRunner';

export default function ProtectedLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authHydrated = useAuthStore((s) => s.authHydrated);
  const checkSession = useAuthStore((s) => s.checkSession);
  const initSocket = useGameStore((s) => s.initSocket);

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
    <div className="flex min-h-[100dvh] bg-background text-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0 pb-16 md:pb-0">
        <Header />
        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6 lg:px-8 supports-[padding:max(0px)]:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto w-full max-w-7xl">
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
      </div>
      <BroadcastPopup />
      <PtcSessionManager />
      <ShortlinkBackgroundRunner />
      <AutoMiningBackgroundRunner />
    </div>
  );
}
