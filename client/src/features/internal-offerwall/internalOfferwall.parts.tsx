import { useEffect, useRef } from 'react';
import { useBrazilDailyResetCountdown } from '../../shared/hooks/useBrazilDailyResetCountdown';
import { ArrowLeft, ExternalLink, Loader2, PlayCircle, Send } from 'lucide-react';
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
    <div className="flex flex-col gap-1.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/90">
          {t('internalOfferwallPage.daily_reset_title', { date: dailyReset.localDate })}
        </p>
        <p className="mt-1 text-xs font-medium text-gray-400">{t('internalOfferwallPage.daily_reset_body')}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600">
          {t('internalOfferwallPage.daily_reset_next')}
        </p>
        <p className="text-lg font-black tabular-nums text-emerald-300">{label}</p>
      </div>
    </div>
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
    <li id={domId} className="rounded-2xl border border-white/5 bg-slate-900/50 p-5 space-y-4">
      {attempt?.status === 'STARTED' ? (
        <div className="pb-3 border-b border-white/10">
          <button
            type="button"
            disabled={abandonBusy || submitBusy || partnerBusy}
            onClick={onOpenExitConfirm}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-600 bg-slate-800/80 text-slate-100 text-sm font-semibold hover:bg-slate-700/90 disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
            {t('internalOfferwallPage.back_to_offerwall')}
          </button>
        </div>
      ) : null}
      {attempt?.status === 'PENDING_REVIEW' ? (
        <div className="flex flex-wrap items-center gap-2 justify-between pb-3 border-b border-white/10">
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl border border-slate-600 bg-slate-800/80 text-slate-100 text-sm font-semibold hover:bg-slate-700/90 w-full sm:w-auto"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden />
            {t('internalOfferwallPage.back_to_offerwall')}
          </button>
        </div>
      ) : null}

      {exitConfirmOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="presentation"
          onClick={onCloseExitConfirm}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="io-exit-title"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="io-exit-title" className="text-lg font-bold text-white">
              {t('internalOfferwallPage.exit_task_confirm_title')}
            </h3>
            <p className="text-sm text-slate-400">{t('internalOfferwallPage.exit_task_confirm_body')}</p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <button
                type="button"
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-600 text-slate-200 text-sm font-semibold hover:bg-slate-800"
                onClick={onCloseExitConfirm}
              >
                {t('internalOfferwallPage.exit_task_confirm_stay')}
              </button>
              <button
                type="button"
                disabled={abandonBusy}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold disabled:opacity-50"
                onClick={onConfirmLeaveTask}
              >
                {abandonBusy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" aria-hidden /> : t('internalOfferwallPage.exit_task_confirm_leave')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-white text-lg">{offer.title}</h2>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">
              {isPtc ? t('internalOfferwallPage.kind_ptc') : t('internalOfferwallPage.kind_general')}
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400">
              {modeSelf ? t('internalOfferwallPage.mode_self') : t('internalOfferwallPage.mode_admin')}
            </span>
          </div>
          {offer.description ? <p className="text-sm text-slate-400 mt-2 whitespace-pre-wrap">{offer.description}</p> : null}
          {Array.isArray(offer.taskMetadata?.requiredActions) && offer.taskMetadata.requiredActions.length > 0 ? (
            <ul className="list-decimal pl-5 text-sm text-slate-400 mt-2 space-y-1">
              {offer.taskMetadata.requiredActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          ) : null}
          {Array.isArray(offer.taskMetadata?.targetCountryCodes) && offer.taskMetadata.targetCountryCodes.length > 0 ? (
            <p className="text-xs text-slate-500 mt-2">
              {t('internalOfferwallPage.target_regions')}: {offer.taskMetadata.targetCountryCodes.join(', ')}
            </p>
          ) : null}
          {offer.taskMetadata?.verificationNote ? (
            <p className="text-xs text-slate-500 mt-2 whitespace-pre-wrap">{offer.taskMetadata.verificationNote}</p>
          ) : null}
          <p className="text-sm text-sky-300/90 mt-2 font-semibold">{rewardLabel}</p>
          <p className="text-xs text-slate-500 mt-2 font-medium">
            {t('internalOfferwallPage.usage_progress', {
              completed: String(usage.completedCount),
              max: String(usage.maxPerPeriod)
            })}
          </p>
          {limitBlocksStart && countdownRemain != null && countdownRemain > 0 ? (
            <p className="text-sm text-amber-400/95 mt-2 font-semibold tabular-nums" role="status" aria-live="polite">
              {t('internalOfferwallPage.available_in', { time: formatHoursClock(countdownRemain) })}
            </p>
          ) : null}
        </div>
        {!attempt ? (
          <button
            type="button"
            disabled={startBusy || limitBlocksStart}
            onClick={onStart}
            className="shrink-0 inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm disabled:opacity-50"
          >
            {startBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <PlayCircle className="w-4 h-4" aria-hidden />}
            {t('internalOfferwallPage.start')}
          </button>
        ) : null}
      </div>

      {attempt?.status === 'PENDING_REVIEW' ? (
        <p className="text-sm text-amber-400/90">{t('internalOfferwallPage.pending_review')}</p>
      ) : null}

      {attempt?.status === 'STARTED' ? (
        <>
          {isPtc && offer.iframeUrl ? (
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3">
              <p className="text-sm text-slate-400">{t('internalOfferwallPage.ptc_new_window_hint')}</p>
              <button
                type="button"
                disabled={partnerBusy || !onPartnerOpen}
                onClick={() => onPartnerOpen?.()}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm disabled:opacity-50"
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
            <div className="space-y-2 text-sm text-slate-400">
              <p>{t('internalOfferwallPage.general_started_hint')}</p>
              {offer.taskMetadata?.externalInfoUrl ? (
                <a
                  href={offer.taskMetadata.externalInfoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline break-all"
                >
                  {t('internalOfferwallPage.open_external_link')}
                </a>
              ) : null}
            </div>
          )}

          {minSec > 0 ? (
            !canSubmit ? (
              <div
                className={`rounded-2xl border px-6 py-8 text-center transition-colors duration-300 ${
                  isPaused
                    ? 'border-amber-500/30 bg-amber-950/20'
                    : 'border-sky-500/25 bg-sky-950/30'
                }`}
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <p className={`text-xs font-bold uppercase tracking-widest ${isPaused ? 'text-amber-400/90' : 'text-sky-300/90'}`}>
                  {isPaused
                    ? t('internalOfferwallPage.countdown_paused')
                    : t('internalOfferwallPage.countdown_title')}
                </p>
                <p className="mt-3 text-5xl font-black tabular-nums tracking-tight text-white sm:text-6xl">{remaining}</p>
                <p className="mt-1 text-sm text-slate-400">{t('internalOfferwallPage.countdown_unit')}</p>
                <p className="mt-4 text-xs text-slate-500 max-w-md mx-auto">
                  {isPaused
                    ? t('internalOfferwallPage.countdown_paused_hint')
                    : t('internalOfferwallPage.min_view_hint', { seconds: String(minSec) })}
                </p>
              </div>
            ) : (
              <p className="text-sm font-semibold text-emerald-400/95">{t('internalOfferwallPage.countdown_ready')}</p>
            )
          ) : (
            <p className="text-xs text-slate-500">{t('internalOfferwallPage.min_view_zero_hint')}</p>
          )}

          {canSubmit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitBusy}
                onClick={onSubmit}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm disabled:opacity-40"
              >
                {submitBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
                {t('internalOfferwallPage.submit')}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
