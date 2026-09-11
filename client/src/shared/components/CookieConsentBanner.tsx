import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Cookie } from 'lucide-react';
import { getCookieConsent, setCookieConsent } from '../utils/cookieConsent';

/**
 * Site-wide cookie consent popup. Mounted once in App.tsx so it shows on every page until
 * the visitor makes a choice — not just the landing page, since the essential session
 * cookies it discloses (blockminer_access/refresh/csrf) are set the moment anyone logs in
 * or registers, wherever they land first.
 *
 * A floating card in the bottom-right corner (not a full-width bar) — deliberately a SOLID
 * background (bg-[#0a0f1c], not translucent/blurred) with a visible border, ring and heavy
 * shadow so it reads as a distinct panel floating over the page, never blending into a dark
 * background like an earlier full-width version did.
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
      className="fixed inset-x-4 bottom-4 z-[60] sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[380px]"
    >
      <div className="rounded-2xl border border-white/15 bg-[#0a0f1c] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] ring-1 ring-black/40">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-500/15">
            <Cookie className="h-4.5 w-4.5 text-sky-400" aria-hidden />
          </span>
          <p className="text-sm leading-6 text-slate-200">
            {t('cookieConsent.message')}{' '}
            <Link to="/cookie-policy" className="font-semibold text-sky-400 underline underline-offset-2 hover:text-sky-300">
              {t('cookieConsent.policyLink')}
            </Link>
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => choose('declined')}
            className="flex-1 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/5"
          >
            {t('cookieConsent.decline')}
          </button>
          <button
            type="button"
            onClick={() => choose('accepted')}
            className="flex-1 rounded-full bg-sky-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-sky-500/25 transition-colors hover:bg-sky-400"
          >
            {t('cookieConsent.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
