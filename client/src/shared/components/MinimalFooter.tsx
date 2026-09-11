import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Slim legal footer for pages that don't carry the landing page's full SiteFooter (the
 * dashboard/app shell, legal documents, verify-email) — same copy/links as AuthShell's
 * compact footer (login/register), kept as one component so both stay in sync.
 */
export default function MinimalFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/[0.06] bg-[#02070f]">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs text-slate-500">© {year} BlockMiner</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <Link to="/terms-of-use" className="hover:text-sky-400 transition-colors">
            {t('landing.footer.link_terms', { defaultValue: 'Termos' })}
          </Link>
          <Link to="/privacy-policy" className="hover:text-sky-400 transition-colors">
            {t('landing.footer.link_privacy', { defaultValue: 'Privacidade' })}
          </Link>
          <Link to="/support" className="hover:text-sky-400 transition-colors">
            {t('landing.nav.support', { defaultValue: 'Suporte' })}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
