import { useNavigate } from 'react-router-dom';
import { t } from './lib/shortlinks.i18n';

export default function AdlinkflyFailedPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-lg space-y-6 p-8 text-center rounded-3xl border-2 border-slate-800 bg-slate-900/60 shadow-[4px_4px_0px_#000000]">
      <h1 className="text-2xl font-black text-white">{t('shortlinks.pastead_failed_title')}</h1>
      <p className="text-sm font-medium text-slate-400">{t('shortlinks.pastead_failed_body')}</p>
      <button
        type="button"
        onClick={() => navigate('/shortlinks')}
        className="rounded-xl bg-blue-600 hover:bg-blue-700 active:translate-x-0.5 active:translate-y-0.5 px-6 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#000000] outline-none focus-visible:ring-2 focus-visible:ring-primary transition-all"
      >
        {t('shortlinks.pastead_back')}
      </button>
    </div>
  );
}
