import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOfferwallTimerStore } from '../offerwall/lib/offerwallTimer.store';
import { useDocumentTitleCountdown } from '../../shared/hooks/useDocumentTitleCountdown';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import axios from 'axios';
import { LayoutGrid, Loader2 } from 'lucide-react';
import { api } from '../../shared/auth/auth.store';
import { formatHoursClock, openPartnerWithReferrer, rewardLine } from './lib/internalOfferwallHelpers';
import { useActiveViewSeconds, useDecountingSeconds } from './lib/internalOfferwallHooks';
import {
  InternalOfferwallDailyResetBanner,
  OfferCard,
} from './internalOfferwall.parts';
import type {
  InternalOfferwallAttempt,
  InternalOfferwallDailyReset,
  InternalOfferwallMutationResponse,
  InternalOfferwallOffer,
  InternalOfferwallOffersResponse,
  InternalOfferwallStatusResponse,
  InternalOfferwallUsage,
  IoTranslate,
} from './lib/internalOfferwallTypes';

const KIND_PTC = 'PTC_IFRAME';
const MODE_ADMIN = 'ADMIN_APPROVAL';
const STATUS_STARTED = 'STARTED';

function ioErrorBody(e: unknown): InternalOfferwallMutationResponse | undefined {
  if (!axios.isAxiosError(e) || e.response?.data == null || typeof e.response.data !== 'object') return undefined;
  return e.response.data as InternalOfferwallMutationResponse;
}

export default function InternalOfferwall() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [flagLoading, setFlagLoading] = useState(true);
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offers, setOffers] = useState<InternalOfferwallOffer[]>([]);
  const [openAttempts, setOpenAttempts] = useState<InternalOfferwallAttempt[]>([]);
  const [startBusyId, setStartBusyId] = useState<number | null>(null);
  const [submitBusyId, setSubmitBusyId] = useState<number | null>(null);
  const [partnerBusyAttemptId, setPartnerBusyAttemptId] = useState<number | null>(null);
  const [abandonBusyId, setAbandonBusyId] = useState<number | null>(null);
  const [dailyReset, setDailyReset] = useState<InternalOfferwallDailyReset | null>(null);

  const clearOfferQuery = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    if (!next.has('offer')) return;
    next.delete('offer');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setFlagLoading(true);
      try {
        const res = await api.get<InternalOfferwallStatusResponse>('/internal-offerwall/status');
        if (!cancelled) setFeatureEnabled(Boolean(res.data?.enabled));
      } catch {
        if (!cancelled) setFeatureEnabled(false);
      } finally {
        if (!cancelled) setFlagLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadOffers = useCallback(async () => {
    setOffersLoading(true);
    try {
      const res = await api.get<InternalOfferwallOffersResponse>('/internal-offerwall/offers');
      const d = res.data;
      if (d?.ok) {
        setOffers(d.offers ?? []);
        setOpenAttempts(d.openAttempts ?? []);
        setDailyReset(d.dailyReset ?? null);
      } else if (d?.code === 'FEATURE_DISABLED' || res.status === 403) {
        setFeatureEnabled(false);
        setOffers([]);
        setOpenAttempts([]);
        setDailyReset(null);
      } else {
        toast.error(t('internalOfferwallPage.load_error'));
      }
    } catch (e: unknown) {
      const d = ioErrorBody(e);
      const st = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (d?.code === 'FEATURE_DISABLED' || st === 403) {
        setFeatureEnabled(false);
        setOffers([]);
        setOpenAttempts([]);
      } else {
        toast.error(t('internalOfferwallPage.load_error'));
      }
    } finally {
      setOffersLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!featureEnabled || flagLoading) return;
    void loadOffers();
  }, [featureEnabled, flagLoading, loadOffers]);

  const focusOfferId = useMemo(() => {
    const raw = searchParams.get('offer');
    const n = parseInt(String(raw || ''), 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [searchParams]);

  useEffect(() => {
    if (!focusOfferId || offersLoading || !offers.length) return;
    const exists = offers.some((o) => o.id === focusOfferId);
    if (!exists) {
      toast.error(t('internalOfferwallPage.inactive_or_missing'));
      return;
    }
    const id = requestAnimationFrame(() => {
      document.getElementById(`io-offer-${focusOfferId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(id);
  }, [focusOfferId, offers, offersLoading, t]);

  const attemptByOfferId = useMemo(() => {
    const m = new Map<number, InternalOfferwallAttempt>();
    for (const a of openAttempts) {
      if (a?.offerId != null) m.set(a.offerId, a);
    }
    return m;
  }, [openAttempts]);

  const onPartnerPageOpen = async (offer: InternalOfferwallOffer, attempt: InternalOfferwallAttempt) => {
    const targetUrl = String(offer.iframeUrl || '').trim();
    if (!targetUrl) return;
    const opened = openPartnerWithReferrer(targetUrl);
    if (!opened) {
      toast.info(t('internalOfferwallPage.popup_blocked'));
      return;
    }
    setPartnerBusyAttemptId(attempt.id);
    try {
      const res = await api.post<InternalOfferwallMutationResponse>(
        `/internal-offerwall/attempts/${attempt.id}/partner-opened`
      );
      const d = res.data;
      if (d?.ok) {
        await loadOffers();
      } else {
        toast.error(d?.message || t('internalOfferwallPage.load_error'));
      }
    } catch (e: unknown) {
      const d = ioErrorBody(e);
      toast.error(d?.message || t('internalOfferwallPage.load_error'));
    } finally {
      setPartnerBusyAttemptId(null);
    }
  };

  const onStart = async (offer: InternalOfferwallOffer) => {
    const offerId = offer.id;
    setStartBusyId(offerId);
    try {
      const res = await api.post<InternalOfferwallMutationResponse>(`/internal-offerwall/offers/${offerId}/start`);
      const d = res.data;
      if (d?.ok) {
        await loadOffers();
      } else {
        const key = d?.messageKey;
        if (key && typeof key === 'string') {
          const time = formatHoursClock(d?.secondsUntilReset ?? 0);
          toast.error(t(key, { time }));
        } else if (d?.code === 'TASK_LIMIT_REACHED' || d?.code === 'DAILY_LIMIT' || res.status === 429) {
          toast.error(t('internalOfferwallPage.errors.task_limit_reached'));
        } else if (d?.code === 'TASK_NOT_AVAILABLE') {
          toast.error(t('internalOfferwallPage.errors.task_not_available'));
        } else {
          toast.error(d?.message || t('internalOfferwallPage.load_error'));
        }
      }
    } catch (e: unknown) {
      const d = ioErrorBody(e);
      const key = d?.messageKey;
      if (key && typeof key === 'string') {
        toast.error(t(key, { time: formatHoursClock(d?.secondsUntilReset ?? 0) }));
      } else if (axios.isAxiosError(e) && e.response?.status === 429) {
        toast.error(t('internalOfferwallPage.errors.task_limit_reached'));
      } else if (d?.code === 'TASK_LIMIT_REACHED' || d?.code === 'DAILY_LIMIT') {
        toast.error(t('internalOfferwallPage.errors.task_limit_reached'));
      } else if (d?.code === 'TASK_NOT_AVAILABLE') {
        toast.error(t('internalOfferwallPage.errors.task_not_available'));
      } else {
        toast.error(d?.message || t('internalOfferwallPage.load_error'));
      }
    } finally {
      setStartBusyId(null);
    }
  };

  const onSubmit = async (attemptId: number) => {
    setSubmitBusyId(attemptId);
    try {
      const res = await api.post<InternalOfferwallMutationResponse>(`/internal-offerwall/attempts/${attemptId}/submit`);
      const d = res.data;
      if (d?.ok) {
        if (d.status === 'PENDING_REVIEW') toast.success(t('internalOfferwallPage.submit_pending'));
        else toast.success(t('internalOfferwallPage.submit_ok'));
        await loadOffers();
      } else if (d?.code === 'MIN_VIEW_NOT_MET') {
        toast.error(d.message || t('internalOfferwallPage.load_error'));
      } else if (d?.code === 'PARTNER_NOT_OPENED') {
        toast.error(t('internalOfferwallPage.partner_not_opened'));
      } else if (d?.code === 'REWARD_CONFIG_INVALID') {
        toast.error(t('internalOfferwallPage.submit_reward_config_error'));
      } else {
        toast.error(d?.message || t('internalOfferwallPage.load_error'));
      }
    } catch (e: unknown) {
      const d = ioErrorBody(e);
      if (d?.code === 'MIN_VIEW_NOT_MET') {
        toast.error(d?.message || t('internalOfferwallPage.load_error'));
      } else if (d?.code === 'PARTNER_NOT_OPENED') {
        toast.error(t('internalOfferwallPage.partner_not_opened'));
      } else if (d?.code === 'REWARD_CONFIG_INVALID') {
        toast.error(t('internalOfferwallPage.submit_reward_config_error'));
      } else {
        toast.error(d?.message || t('internalOfferwallPage.load_error'));
      }
    } finally {
      setSubmitBusyId(null);
    }
  };

  const onAbandonAttempt = useCallback(
    async (attemptId: number) => {
      setAbandonBusyId(attemptId);
      try {
        const res = await api.post<InternalOfferwallMutationResponse>(`/internal-offerwall/attempts/${attemptId}/abandon`);
        const d = res.data;
        if (d?.ok) {
          toast.success(t('internalOfferwallPage.abandon_ok'));
          clearOfferQuery();
          await loadOffers();
        } else {
          toast.error(d?.message || t('internalOfferwallPage.load_error'));
        }
      } catch (e: unknown) {
        const d = ioErrorBody(e);
        if (d?.code === 'CANNOT_ABANDON_PENDING_REVIEW') {
          toast.error(t('internalOfferwallPage.cannot_abandon_pending_review'));
        } else {
          toast.error(d?.message || t('internalOfferwallPage.load_error'));
        }
      } finally {
        setAbandonBusyId(null);
      }
    },
    [t, clearOfferQuery, loadOffers]
  );

  if (flagLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-10 h-10 animate-spin text-sky-400" aria-hidden />
      </div>
    );
  }

  if (!featureEnabled) {
    return (
      <div className=" rounded-2xl border border-white/5 bg-slate-900/50 p-8 text-center text-slate-400">
        <LayoutGrid className="w-12 h-12 mx-auto mb-3 text-slate-600" aria-hidden />
        <p>{t('internalOfferwallPage.disabled')}</p>
      </div>
    );
  }

  return (
    <div className=" space-y-8">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20">
          <LayoutGrid className="w-8 h-8 text-sky-400" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">{t('internalOfferwallPage.title')}</h1>
          <p className="text-slate-400 mt-1 text-sm md:text-base max-w-xl">{t('internalOfferwallPage.subtitle')}</p>
        </div>
      </div>

      {dailyReset ? <InternalOfferwallDailyResetBanner dailyReset={dailyReset} t={t} onResetElapsed={loadOffers} /> : null}

      {offersLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-10 h-10 animate-spin text-sky-400" aria-hidden />
        </div>
      ) : offers.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-slate-900/40 p-10 text-center text-slate-500">
          {t('internalOfferwallPage.empty')}
        </div>
      ) : (
        <ul className="space-y-6">
          {offers.map((offer) => {
            const attempt = attemptByOfferId.get(offer.id);
            return (
              <OfferCardController
                key={offer.id}
                domId={`io-offer-${offer.id}`}
                offer={offer}
                attempt={attempt}
                t={t}
                rewardLabel={rewardLine(t, offer)}
                startBusy={startBusyId === offer.id}
                submitBusy={submitBusyId === attempt?.id}
                partnerBusy={partnerBusyAttemptId === attempt?.id}
                abandonBusy={abandonBusyId != null && abandonBusyId === attempt?.id}
                onStart={() => void onStart(offer)}
                onSubmit={() => attempt && void onSubmit(attempt.id)}
                onPartnerOpen={attempt ? () => void onPartnerPageOpen(offer, attempt) : undefined}
                onCooldownElapsed={loadOffers}
                onClearOfferFocus={clearOfferQuery}
                onAbandonAttempt={onAbandonAttempt}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

type OfferCardControllerProps = {
  domId: string;
  offer: InternalOfferwallOffer;
  attempt: InternalOfferwallAttempt | undefined;
  t: IoTranslate;
  rewardLabel: string;
  startBusy: boolean;
  submitBusy: boolean;
  partnerBusy: boolean;
  abandonBusy: boolean;
  onStart: () => void;
  onSubmit: () => void;
  onPartnerOpen: (() => void) | undefined;
  onCooldownElapsed: () => Promise<void>;
  onClearOfferFocus: () => void;
  onAbandonAttempt: (attemptId: number) => Promise<void>;
};

function OfferCardController({
  domId,
  offer,
  attempt,
  t,
  rewardLabel,
  startBusy,
  submitBusy,
  partnerBusy,
  abandonBusy,
  onStart,
  onSubmit,
  onPartnerOpen,
  onCooldownElapsed,
  onClearOfferFocus,
  onAbandonAttempt
}: OfferCardControllerProps) {
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  useEffect(() => {
    if (!exitConfirmOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExitConfirmOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitConfirmOpen]);

  const isPtc = String(offer.kind).toUpperCase() === KIND_PTC;
  const minSec = Number(offer.minViewSeconds) || 0;
  const usage: InternalOfferwallUsage = (offer.usage || {
    completedCount: 0,
    maxPerPeriod: Number(offer.maxExecutionsPerPeriod ?? offer.dailyLimitPerUser) || 3,
    secondsUntilAvailable: null,
    canStartNew: true
  }) as InternalOfferwallUsage;
  const limitBlocksStart = !attempt && !usage.canStartNew;
  const countdownRemain = useDecountingSeconds(usage.secondsUntilAvailable);
  const cooldownFireRef = useRef(false);
  useEffect(() => {
    cooldownFireRef.current = false;
  }, [usage.secondsUntilAvailable, offer.id]);
  useEffect(() => {
    if (countdownRemain !== 0) return undefined;
    if (usage.secondsUntilAvailable == null || usage.secondsUntilAvailable <= 0) return undefined;
    if (cooldownFireRef.current) return undefined;
    cooldownFireRef.current = true;
    void onCooldownElapsed();
    return undefined;
  }, [countdownRemain, usage.secondsUntilAvailable, onCooldownElapsed]);

  const clockIso = isPtc ? String(attempt?.partnerOpenedAt || '') : String(attempt?.startedAt || '');
  const timerActive = attempt?.status === STATUS_STARTED && Boolean(clockIso);
  const { elapsed, isPaused } = useActiveViewSeconds(clockIso, timerActive);
  const canSubmit = attempt?.status === STATUS_STARTED && elapsed >= minSec;
  const modeSelf = String(offer.completionMode || '') !== MODE_ADMIN;
  const remaining = Math.max(0, Math.ceil(minSec - elapsed));

  // Contador regressivo na aba do browser
  useDocumentTitleCountdown({
    remainingSeconds: remaining,
    isPaused,
    isActive: timerActive && minSec > 0,
    isComplete: canSubmit,
    pageName: 'Offerwall',
  });

  // Sync timer state to global store so Header shows live progress
  const syncTimer = useOfferwallTimerStore((s) => s.sync);
  const clearTimer = useOfferwallTimerStore((s) => s.clear);
  useEffect(() => {
    if (timerActive && minSec > 0) {
      syncTimer({ offerTitle: String(offer.title || ''), elapsed, minSec, isPaused, canSubmit });
    } else if (!timerActive) {
      clearTimer();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerActive, elapsed, isPaused, canSubmit, minSec]);
  // Clear global timer when this card unmounts
  useEffect(() => () => clearTimer(), [clearTimer]);

  const handleBackToListOnly = () => {
    onClearOfferFocus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmLeaveTask = async () => {
    if (!attempt?.id) return;
    setExitConfirmOpen(false);
    await onAbandonAttempt(attempt.id);
  };

  return (
    <OfferCard
      domId={domId}
      offer={offer}
      attempt={attempt}
      t={t}
      rewardLabel={rewardLabel}
      startBusy={startBusy}
      submitBusy={submitBusy}
      partnerBusy={partnerBusy}
      abandonBusy={abandonBusy}
      isPtc={isPtc}
      modeSelf={modeSelf}
      usage={usage}
      limitBlocksStart={limitBlocksStart}
      countdownRemain={countdownRemain}
      minSec={minSec}
      isPaused={isPaused}
      canSubmit={canSubmit}
      remaining={remaining}
      exitConfirmOpen={exitConfirmOpen}
      onStart={onStart}
      onSubmit={onSubmit}
      onPartnerOpen={onPartnerOpen}
      onOpenExitConfirm={() => setExitConfirmOpen(true)}
      onCloseExitConfirm={() => setExitConfirmOpen(false)}
      onConfirmLeaveTask={() => void confirmLeaveTask()}
      onBackToList={handleBackToListOnly}
    />
  );
}
