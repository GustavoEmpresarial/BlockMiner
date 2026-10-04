import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Info, ShieldCheck, Database, Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MethodologyModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  // Focus capture, body scroll lock, and ESC / Tab focus trap
  useEffect(() => {
    if (!open) return;

    if (typeof document !== 'undefined') {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      if (cardRef.current) {
        cardRef.current.focus();
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
          return;
        }

        if (e.key === 'Tab') {
          const card = cardRef.current;
          if (!card) return;
          const focusable = card.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          );
          const focusableList = Array.from(focusable).filter((el) => !el.hasAttribute('disabled'));
          if (!focusableList.length) return;
          const first = focusableList[0];
          const last = focusableList[focusableList.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === first || !card.contains(document.activeElement)) {
              e.preventDefault();
              last.focus();
            }
          } else {
            if (document.activeElement === last || !card.contains(document.activeElement)) {
              e.preventDefault();
              first.focus();
            }
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
        window.removeEventListener('keydown', handleKeyDown);
        if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
          previousActiveElementRef.current.focus();
        }
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="methodology-title"
      data-testid="methodology-modal"
      onClick={onClose}
    >
      <div
        ref={cardRef}
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-3xl border-2 border-primary/30 bg-[#0d111d] text-white shadow-[0_0_35px_rgba(59,130,246,0.2),8px_8px_0px_#000000] overflow-hidden outline-none animate-in zoom-in-95 duration-200 max-h-[min(90dvh,90vh)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-6 py-4 border-b border-white/10 bg-slate-900/60 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shadow-[2px_2px_0px_#000000]">
            <Info className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
          </div>
          <h2 id="methodology-title" className="text-sm font-black text-white uppercase tracking-wider flex-1">
            {t('transparency.methodology.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-700 bg-black/50 text-gray-400 hover:text-white hover:border-gray-500 hover:bg-black/80 transition-all shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            aria-label={t('transparency.methodology.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 text-xs sm:text-sm text-slate-300 leading-relaxed overflow-y-auto">
          <p className="text-slate-200 leading-relaxed font-medium">
            {t('transparency.methodology.intro')}
          </p>
          <ul className="space-y-3 list-none">
            <li className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-950/20 p-4 shadow-[3px_3px_0px_#000000]">
              <div className="flex items-center gap-2 mb-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">
                  {t('transparency.methodology.manual_title')}
                </p>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{t('transparency.methodology.manual_body')}</p>
            </li>
            <li className="rounded-2xl border-2 border-violet-500/30 bg-violet-950/20 p-4 shadow-[3px_3px_0px_#000000]">
              <div className="flex items-center gap-2 mb-1.5">
                <Database className="w-4 h-4 text-violet-400" aria-hidden="true" />
                <p className="text-xs font-black text-violet-400 uppercase tracking-widest">
                  {t('transparency.methodology.onchain_title')}
                </p>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{t('transparency.methodology.onchain_body')}</p>
            </li>
            <li className="rounded-2xl border-2 border-amber-500/30 bg-amber-950/20 p-4 shadow-[3px_3px_0px_#000000]">
              <div className="flex items-center gap-2 mb-1.5">
                <Cpu className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <p className="text-xs font-black text-amber-400 uppercase tracking-widest">
                  {t('transparency.methodology.offchain_title')}
                </p>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{t('transparency.methodology.offchain_body')}</p>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : modal;
}
