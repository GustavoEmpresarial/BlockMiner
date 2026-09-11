import { useEffect } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { Toaster } from 'sonner';
import './styles.css';
import { changeLanguageSafe, i18nReady } from '../src/i18n/config';
import AdminLayout from '../src/features/admin/AdminLayout';
import AdminTournamentsPage from '../src/features/admin/tournaments/AdminTournamentsPage';

/** Drop ugly /admin-t/index.html from the address bar. */
function cleanOverlayUrl() {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  if (pathname === '/admin-t/index.html' || pathname === '/admin-t') {
    window.history.replaceState(null, '', `/admin-t/${search}${hash}`);
  }
}

/** Other admin routes live in the main SPA — leave this overlay with a full navigation. */
function ExternalAdminRedirect() {
  const loc = useLocation();
  useEffect(() => {
    const target = `${loc.pathname}${loc.search}${loc.hash}` || '/admin';
    window.location.assign(target);
  }, [loc.pathname, loc.search, loc.hash]);
  return (
    <div className="flex min-h-[40vh] items-center justify-center py-12" aria-busy="true">
      <div className="h-10 w-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
    </div>
  );
}

function OverlayApp() {
  useEffect(() => {
    cleanOverlayUrl();
  }, []);

  return (
    <MemoryRouter initialEntries={['/admin/tournaments']}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/admin/tournaments" element={<AdminTournamentsPage />} />
          <Route path="/admin/*" element={<ExternalAdminRedirect />} />
        </Route>
        <Route path="*" element={<Navigate to="/admin/tournaments" replace />} />
      </Routes>
      <Toaster
        theme="dark"
        position="bottom-right"
        richColors={false}
        expand
        toastOptions={{
          className:
            'bg-slate-950/80 backdrop-blur-md border border-white/5 rounded-xl text-white font-mono text-[10px] uppercase tracking-widest p-4 shadow-2xl',
        }}
      />
    </MemoryRouter>
  );
}

void i18nReady.then(async () => {
  // Admin overlay is operations UI — keep English regardless of player locale cookie.
  await changeLanguageSafe('en');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <OverlayApp />
    </StrictMode>,
  );
});
