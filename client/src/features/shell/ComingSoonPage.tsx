import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';

/** Temporary placeholder for sidebar destinations not yet ported. */
export default function ComingSoonPage() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="flex max-w-md flex-col items-center gap-4 text-center">
        <IconBadge icon={Construction} size="lg" />
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">{t('shell.coming_soon_title')}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {t('shell.coming_soon_body')}{' '}
            <span className="font-mono text-slate-300">{pathname}</span>.
          </p>
        </div>
      </Card>
    </div>
  );
}
