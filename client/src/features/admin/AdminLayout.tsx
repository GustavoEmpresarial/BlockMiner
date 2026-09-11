import { useState, useEffect, Suspense, useRef } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import AdminSidebar from './components/AdminSidebar';
import { fetchAdminAuthOk } from '../admin-auth/index';
import {
  checkAdminAuthThrottled,
  getAdminAuthCache,
} from '../admin-auth/lib/adminAuth.cache';

export default function AdminLayout() {
  const location = useLocation();
  const initial = getAdminAuthCache();
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean | null>(
    initial.fresh ? initial.value : null,
  );
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const didCheckRef = useRef(false);

  useEffect(() => {
    if (didCheckRef.current) return;
    didCheckRef.current = true;
    // Note: intentionally not cancelled on cleanup — React 19 StrictMode's dev-only
    // mount→cleanup→mount double-invoke would otherwise cancel the *first* real
    // fetch's result via the ref-guarded second effect run never firing its own
    // fetch, leaving isAdminAuthenticated stuck at null forever.
    void checkAdminAuthThrottled(fetchAdminAuthOk).then((ok) => {
      setIsAdminAuthenticated(ok);
    });
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  if (isAdminAuthenticated === null) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center px-4">
        <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (isAdminAuthenticated === false) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <div className="flex h-[100dvh] min-h-0 max-h-[100dvh] bg-slate-950 overflow-hidden text-slate-100 font-sans">
      {mobileNavOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-[1px] lg:hidden"
          aria-label="Fechar menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}
      <AdminSidebar mobileOpen={mobileNavOpen} onNavigate={() => setMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden w-full">
        <header className="h-16 sm:h-20 shrink-0 bg-slate-900/50 backdrop-blur-md border-b border-slate-800/50 flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 sticky top-0 z-10 supports-[padding:max(0px)]:pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button
              type="button"
              className="lg:hidden shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/80 p-2.5 text-slate-100 hover:bg-slate-700/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70"
              aria-expanded={mobileNavOpen}
              aria-controls="admin-main-nav"
              aria-label={mobileNavOpen ? 'Fechar menu' : 'Abrir menu'}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              {mobileNavOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg lg:text-xl font-black text-white tracking-tight uppercase truncate">
                Painel administrativo
              </h1>
              <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-widest truncate">
                BlockMiner
              </p>
            </div>
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8 flex flex-col supports-[padding:max(0px)]:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col min-h-0 min-w-0">
            <Suspense
              fallback={
                <div className="flex min-h-[40vh] items-center justify-center py-12" aria-busy="true">
                  <div className="h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}
