import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBrazilDailyResetCountdown } from '../../shared/hooks/useBrazilDailyResetCountdown';
import { ArrowLeft, ExternalLink, Loader2, PlayCircle, Send, X } from 'lucide-react';
import Card from '../../shared/components/Card';
import { formatHoursClock } from './lib/internalOfferwallHelpers';
import type {
  InternalOfferwallAttempt,
  InternalOfferwallDailyReset,
  InternalOfferwallOffer,
  InternalOfferwallUsage,
  IoTranslate,
} from './lib/internalOfferwallTypes';

export function InternalOfferwallDailyResetBanner({
  dailyReset,
  t,
  onResetElapsed,
}: {
  dailyReset: InternalOfferwallDailyReset;
  t: IoTranslate;
  onResetElapsed: () => Promise<void>;
}) {
  const { label, remainingMs } = useBrazilDailyResetCountdown(dailyReset.nextResetInMs);
  const reloadedRef = useRef(false);

  useEffect(() => {
    reloadedRef.current = false;
  }, [dailyReset.localDate]);

  useEffect(() => {
    if (remainingMs > 0 || reloadedRef.current) return undefined;
    reloadedRef.current = true;
    void onResetElapsed();
    return undefined;
  }, [remainingMs, onResetElapsed]);

  return (
    <Card className="flex flex-col gap-2 rounded-2xl border-2 border-emerald-500/30 bg-emerald-950/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between shadow-[2px_2px_0px_#000000]">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
          {t('internalOfferwallPage.daily_reset_title', { date: dailyReset.localDate || '—' })}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-300">{t('internalOfferwallPage.daily_reset_body')}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
          {t('internalOfferwallPage.daily_reset_next')}
        </p>
        <p className="text-lg font-black tabular-nums text-emerald-300 font-mono">{label}</p>
      </div>
    </Card>
  );
}

export type OfferCardProps = {
  domId: string;
  offer: InternalOfferwallOffer;
  attempt: InternalOfferwallAttempt | undefined;
  t: IoTranslate;
  rewardLabel: string;
  startBusy: boolean;
  submitBusy: boolean;
  partnerBusy: boolean;
  abandonBusy: boolean;
  isPtc: boolean;
  modeSelf: boolean;
  usage: InternalOfferwallUsage;
  limitBlocksStart: boolean;
  countdownRemain: number | null;
  minSec: number;
  isPaused: boolean;
  canSubmit: boolean;
  remaining: number;
  exitConfirmOpen: boolean;
  onStart: () => void;
  onSubmit: () => void;
  onPartnerOpen: (() => void) | undefined;
  onOpenExitConfirm: () => void;
  onCloseExitConfirm: () => void;
  onConfirmLeaveTask: () => void;
  onBackToList: () => void;
};

export function OfferCard({
  domId,
  offer,
  attempt,
  t,
  rewardLabel,
  startBusy,
  submitBusy,
  partnerBusy,
  abandonBusy,
  isPtc,
  modeSelf,
  usage,
  limitBlocksStart,
  countdownRemain,
  minSec,
  isPaused,
  canSubmit,
  remaining,
  exitConfirmOpen,
  onStart,
  onSubmit,
  onPartnerOpen,
  onOpenExitConfirm,
  onCloseExitConfirm,
  onConfirmLeaveTask,
  onBackToList,
}: OfferCardProps) {
  return (
    <Card as="li" id={domId} spacing="md">
      {attempt?.status === 'STARTED' ? (
        <div className="pb-3 border-b-2 border-slate-800">
          <button
            type="button"
            disabled={abandonBusy || submitBusy || partnerBusy}
            onClick={onOpenExitConfirm}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl border-2 border-slate-700 bg-slate-900 text-slate-200 text-xs font-black uppercase tracking-wider hover:text-white hover:border-slate-600 active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000] transition-all disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
            {t('internalOfferwallPage.back_to_offerwall')}
          </button>
        </div>
      ) : null}
      {attempt?.status === 'PENDING_REVIEW' ? (
        <div className="flex flex-wrap items-center gap-2 justify-between pb-3 border-b-2 border-slate-800">
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border-2 border-slate-700 bg-slate-900 text-slate-200 text-xs font-black uppercase tracking-wider hover:text-white hover:border-slate-600 active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000] transition-all w-full sm:w-auto outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
            {t('internalOfferwallPage.back_to_offerwall')}
          </button>
        </div>
      ) : null}

      {exitConfirmOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
              role="presentation"
              onClick={onCloseExitConfirm}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="io-exit-title"
                className="w-full max-w-md rounded-3xl border-2 border-slate-800 bg-slate-900 p-6 sm:p-7 shadow-[4px_4px_0px_#000000] space-y-4 animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h3 id="io-exit-title" className="text-lg font-black text-white uppercase tracking-tight">
                    {t('internalOfferwallPage.exit_task_confirm_title')}
                  </h3>
                  <button
                    type="button"
                    onClick={onCloseExitConfirm}
                    aria-label={t('common.close')}
                    className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-slate-300 font-medium leading-relaxed">
                  {t('internalOfferwallPage.exit_task_confirm_body')}
                </p>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    className="min-h-[44px] px-4 py-2.5 rounded-xl border-2 border-slate-700 bg-slate-900 text-slate-200 text-xs font-black uppercase tracking-wider hover:text-white hover:border-slate-600 active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000] transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={onCloseExitConfirm}
                  >
                    {t('internalOfferwallPage.exit_task_confirm_stay')}
                  </button>
                  <button
                    type="button"
                    disabled={abandonBusy}
                    className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:translate-x-0.5 active:translate-y-0.5 text-slate-950 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_#000000] transition-all disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    onClick={onConfirmLeaveTask}
                  >
                    {abandonBusy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" aria-hidden /> : t('internalOfferwallPage.exit_task_confirm_leave')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-black text-white text-lg tracking-tight">{offer.title}</h2>
            <span className="text-[10px] uppercase font-black tracking-widest px-2.5 py-0.5 rounded-full border border-slate-700 bg-slate-800 text-slate-300">
              {isPtc ? t('internalOfferwallPage.kind_ptc') : t('internalOfferwallPage.kind_general')}
            </span>
            <span className="text-[10px] uppercase font-black tracking-widest px-2.5 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
              {modeSelf ? t('internalOfferwallPage.mode_self') : t('internalOfferwallPage.mode_admin')}
            </span>
          </div>
          {offer.description ? <p className="text-sm text-slate-300 mt-2 whitespace-pre-wrap font-medium leading-relaxed">{offer.description}</p> : null}
          {Array.isArray(offer.taskMetadata?.requiredActions) && offer.taskMetadata.requiredActions.length > 0 ? (
            <ul className="list-decimal pl-5 text-sm text-slate-300 mt-2 space-y-1 font-medium">
              {offer.taskMetadata.requiredActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : null}
          {Array.isArray(offer.taskMetadata?.targetCountryCodes) && offer.taskMetadata.targetCountryCodes.length > 0 ? (
            <p className="text-xs text-slate-400 mt-2 font-medium">
              {t('internalOfferwallPage.target_regions')}: {offer.taskMetadata.targetCountryCodes.join(', ')}
            </p>
          ) : null}
          {offer.taskMetadata?.verificationNote ? (
            <p className="text-xs text-slate-400 mt-2 whitespace-pre-wrap font-medium">{offer.taskMetadata.verificationNote}</p>
          ) : null}
          <p className="text-sm text-sky-400 mt-2 font-black font-mono">{rewardLabel}</p>
          <p className="text-xs text-slate-400 mt-1.5 font-medium">
            {t('internalOfferwallPage.usage_progress', {
              completed: String(usage.completedCount ?? 0),
              max: String(usage.maxPerPeriod ?? 0),
            })}
          </p>
          {limitBlocksStart && countdownRemain != null && countdownRemain > 0 ? (
            <p className="text-sm text-amber-400 mt-2 font-black tabular-nums font-mono" role="status" aria-live="polite">
              {t('internalOfferwallPage.available_in', { time: formatHoursClock(countdownRemain) || '—' })}
            </p>
          ) : null}
        </div>
        {!attempt ? (
          <button
            type="button"
            disabled={startBusy || limitBlocksStart}
            onClick={onStart}
            className="shrink-0 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 active:translate-x-0.5 active:translate-y-0.5 text-slate-950 font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_#000000] disabled:opacity-50 transition-all outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            {startBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <PlayCircle className="w-4 h-4" aria-hidden />}
            {t('internalOfferwallPage.start')}
          </button>
        ) : null}
      </div>

      {attempt?.status === 'PENDING_REVIEW' ? (
        <p className="text-sm text-amber-400 font-bold">{t('internalOfferwallPage.pending_review')}</p>
      ) : null}

      {attempt?.status === 'STARTED' ? (
        <>
          {isPtc && offer.iframeUrl ? (
            <div className="rounded-2xl border-2 border-slate-800 bg-slate-950 p-4 space-y-3 shadow-[2px_2px_0px_#000000]">
              <p className="text-sm text-slate-300 font-medium">{t('internalOfferwallPage.ptc_new_window_hint')}</p>
              <button
                type="button"
                disabled={partnerBusy || !onPartnerOpen}
                onClick={() => onPartnerOpen?.()}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 active:translate-x-0.5 active:translate-y-0.5 text-slate-950 font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_#000000] disabled:opacity-50 transition-all outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                {partnerBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                ) : (
                  <ExternalLink className="w-4 h-4 shrink-0" aria-hidden />
                )}
                {t('internalOfferwallPage.open_partner_new_window')}
              </button>
            </div>
          ) : (
            <div className="space-y-2 text-sm text-slate-300 font-medium">
              <p>{t('internalOfferwallPage.general_started_hint')}</p>
              {offer.taskMetadata?.externalInfoUrl ? (
                <a
                  href={offer.taskMetadata.externalInfoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline break-all font-mono font-bold"
                >
                  {t('internalOfferwallPage.open_external_link')}
                </a>
              ) : null}
            </div>
          )}

          {minSec > 0 ? (
            !canSubmit ? (
              <div
                className={`rounded-2xl border-2 px-6 py-8 text-center transition-colors duration-300 shadow-[2px_2px_0px_#000000] ${
                  isPaused
                    ? 'border-amber-500/40 bg-amber-950/20'
                    : 'border-sky-500/30 bg-sky-950/30'
                }`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <p className={`text-xs font-black uppercase tracking-widest ${isPaused ? 'text-amber-400' : 'text-sky-300'}`}>
                  {isPaused
                    ? t('internalOfferwallPage.countdown_paused')
                    : t('internalOfferwallPage.countdown_title')}
                </p>
                <p className="mt-3 text-5xl font-black tabular-nums tracking-tight text-white sm:text-6xl font-mono">{remaining}</p>
                <p className="mt-1 text-sm text-slate-400 font-medium">{t('internalOfferwallPage.countdown_unit')}</p>
                <p className="mt-4 text-xs text-slate-400 max-w-md mx-auto font-medium">
                  {isPaused
                    ? t('internalOfferwallPage.countdown_paused_hint')
                    : t('internalOfferwallPage.min_view_hint', { seconds: String(minSec ?? 0) })}
                </p>
              </div>
            ) : (
              <p className="text-sm font-black text-emerald-400">{t('internalOfferwallPage.countdown_ready')}</p>
            )
          ) : (
            <p className="text-xs text-slate-500 font-medium">{t('internalOfferwallPage.min_view_zero_hint')}</p>
          )}

          {canSubmit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitBusy}
                onClick={onSubmit}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:translate-x-0.5 active:translate-y-0.5 text-slate-950 font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_#000000] disabled:opacity-40 transition-all outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                {submitBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
                {t('internalOfferwallPage.submit')}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
