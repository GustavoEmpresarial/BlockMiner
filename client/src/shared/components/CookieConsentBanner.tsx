import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Cookie } from 'lucide-react';
import { getCookieConsent, setCookieConsent } from '../utils/cookieConsent';

/**
 * Site-wide cookie consent banner. Mounted once in App.tsx so it shows on every page until
 * the visitor makes a choice — not just the landing page, since the essential session
 * cookies it discloses (blockminer_access/refresh/csrf) are set the moment anyone logs in
 * or registers, wherever they land first.
 *
 * Deliberately a SOLID background (bg-[#050810], not a translucent/blurred one) with a
 * visible top border and shadow: an earlier version of this banner nearly blended into dark
 * page backgrounds and was reported as barely legible. This one is opaque on purpose.
 */
export default function CookieConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getCookieConsent() === null);
  }, []);

  if (!visible) return null;

  const choose = (choice: 'accepted' | 'declined') => {
    setCookieConsent(choice);
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label={t('cookieConsent.policyLink', { defaultValue: 'Cookie Policy' })}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-white/10 bg-[#050810] px-4 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.45)] sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-sky-400" aria-hidden />
          <p className="text-sm leading-6 text-slate-200">
            {t('cookieConsent.message')}{' '}
            <Link to="/cookie-policy" className="font-semibold text-sky-400 underline underline-offset-2 hover:text-sky-300">
              {t('cookieConsent.policyLink')}
            </Link>
          </p>
        </div>
        <div className="flex w-full shrink-0 gap-2 sm:w-auto">
          <button
            type="button"
            onClick={() => choose('declined')}
            className="flex-1 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/5 sm:flex-none"
          >
            {t('cookieConsent.decline')}
          </button>
          <button
            type="button"
            onClick={() => choose('accepted')}
            className="flex-1 rounded-full bg-sky-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-sky-500/25 transition-colors hover:bg-sky-400 sm:flex-none"
          >
            {t('cookieConsent.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
