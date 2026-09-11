import { X, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MethodologyModal({ open, onClose }: Props) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="methodology-title"
      data-testid="methodology-modal"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/8">
          <Info className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
          <h2 id="methodology-title" className="text-sm font-black text-white uppercase tracking-widest flex-1">
            {t('transparency.methodology.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
            aria-label={t('transparency.methodology.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 text-sm text-gray-300 leading-relaxed">
          <p>{t('transparency.methodology.intro')}</p>
          <ul className="space-y-3 list-none">
            <li className="rounded-xl border border-emerald-500/15 bg-emerald-950/20 px-4 py-3">
              <p className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-1">{t('transparency.methodology.manual_title')}</p>
              <p className="text-xs text-gray-400">{t('transparency.methodology.manual_body')}</p>
            </li>
            <li className="rounded-xl border border-violet-500/15 bg-violet-950/20 px-4 py-3">
              <p className="text-xs font-black text-violet-400 uppercase tracking-widest mb-1">{t('transparency.methodology.onchain_title')}</p>
              <p className="text-xs text-gray-400">{t('transparency.methodology.onchain_body')}</p>
            </li>
            <li className="rounded-xl border border-amber-500/15 bg-amber-950/20 px-4 py-3">
              <p className="text-xs font-black text-amber-400 uppercase tracking-widest mb-1">{t('transparency.methodology.offchain_title')}</p>
              <p className="text-xs text-gray-400">{t('transparency.methodology.offchain_body')}</p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
