import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Menu, X } from 'lucide-react';
import BrandLogo from './BrandLogo';
import SiteFooter from './SiteFooter';

type AuthShellProps = {
  children: ReactNode;
  hideAuthCta?: 'login' | 'register';
};

/**
 * Minimal chrome for /login and /register — brand + CTA, no landing mega-footer.
 */
export default function AuthShell({ children, hideAuthCta }: AuthShellProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#020511] text-slate-100 flex flex-col">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-[#020511] to-[#060a14]" />
        <div className="absolute -top-48 left-1/2 h-[min(420px,70vw)] w-[min(420px,70vw)] -translate-x-1/2 rounded-full bg-sky-600/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              'linear-gradient(rgba(56,189,248,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.05) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <header className="relative z-30 border-b border-white/[0.06] bg-[#02070f]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-lg sm:max-w-xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 min-w-0" aria-label={t('landing.nav.brand_aria')}>
            <BrandLogo variant="header" interactive />
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            {hideAuthCta !== 'register' && (
              <Link
                to="/register"
                className="inline-flex items-center gap-1 rounded-full bg-sky-500 hover:bg-sky-400 px-3.5 py-2 text-xs sm:text-sm font-bold text-white shadow-lg shadow-sky-500/25"
              >
                {t('landing.nav.register')}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
            {hideAuthCta !== 'login' && (
              <Link
                to="/login"
                className="inline-flex rounded-full border border-white/10 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-white/5"
              >
                {t('landing.nav.login')}
              </Link>
            )}
            <button
              type="button"
              className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-slate-300"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="sm:hidden border-t border-white/[0.06] px-4 py-3 space-y-1 bg-[#02070f]">
            <Link to="/" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-white hover:bg-white/5">
              {t('common.back', { defaultValue: 'Voltar' })}
            </Link>
            <Link to="/terms-of-use" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-white hover:bg-white/5">
              {t('landing.footer.link_terms', { defaultValue: 'Termos' })}
            </Link>
            <Link to="/privacy-policy" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-white hover:bg-white/5">
              {t('landing.footer.link_privacy', { defaultValue: 'Privacidade' })}
            </Link>
            <Link to="/cookie-policy" onClick={() => setMenuOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm text-white hover:bg-white/5">
              {t('legal.footer.cookiePolicy', { defaultValue: 'Cookies' })}
            </Link>
          </div>
        )}
      </header>

      <main className="relative z-10 flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full flex justify-center">{children}</div>
      </main>

      <SiteFooter />
    </div>
  );
}
