import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

/** Temporary placeholder for sidebar destinations not yet ported. */
export default function ComingSoonPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
        <Construction className="h-6 w-6 text-primary" aria-hidden />
      </div>
      <div>
        <h1 className="text-xl font-black text-white">{t('shell.coming_soon_title')}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('shell.coming_soon_body')}{' '}
          <span className="font-mono text-gray-400">{pathname}</span>.
        </p>
      </div>
    </div>
  );
}
