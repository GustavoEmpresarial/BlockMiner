import { Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import IconBadge from '../../shared/components/IconBadge';
import { CredentialTab } from './CredentialTab';
import { StreamersMinerShowcase } from './components/StreamersMinerShowcase';

export default function CreatorPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3">
          <IconBadge icon={Video} variant="red" size="lg" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              {t('ranking.social.creator_area')}
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium">
              {t('ranking.social.creator_area_sub')}
            </p>
          </div>
        </div>
      </div>
      <StreamersMinerShowcase />
      <CredentialTab />
    </div>
  );
}
