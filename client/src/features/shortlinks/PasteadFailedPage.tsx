import { useNavigate } from 'react-router-dom';
import { t } from './lib/shortlinks.i18n';

export default function PasteadFailedPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-lg space-y-6 p-8 text-center">
      <h1 className="text-2xl font-black text-white">{t('shortlinks.pastead_failed_title')}</h1>
      <p className="text-sm font-medium text-gray-400">{t('shortlinks.pastead_failed_body')}</p>
      <button
        type="button"
        onClick={() => navigate('/shortlinks')}
        className="rounded-2xl bg-primary px-6 py-3 text-sm font-black uppercase tracking-widest text-white"
      >
        {t('shortlinks.pastead_back')}
      </button>
    </div>
  );
}
