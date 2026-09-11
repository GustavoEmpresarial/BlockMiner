import { useState, useEffect, useCallback, useMemo, memo, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Eye, Timer, CheckCircle2, Gift, Loader2, ExternalLink,
  Info, Megaphone, AlertCircle, PauseCircle, XCircle, RefreshCw,
  Globe, PlayCircle,
} from 'lucide-react';
import { validateTrustedEvent } from '../../../shared/utils/security';
import { api } from '../../../shared/auth/auth.store';
import { usePtcSessionStore } from '../lib/ptcSession.store';
import { useActiveViewSeconds } from '../lib/ptcOfferwallHooks';
import { useDocumentTitleCountdown } from '../../../shared/hooks/useDocumentTitleCountdown';
import { useUtcDailyResetCountdown } from '../../../shared/hooks/useUtcDailyResetCountdown';

// ── Types ─────────────────────────────────────────────────────────────────────

import {
  SitePreview,
  SkeletonCard,
  StatsStrip,
  UtcResetBanner,
  domainToGradient,
  extractDomain,
  fmtTime,
} from './ptc.shared';
import type {
  PtcAd,
  PtcDailyReset,
  PtcSettings,
  SessionApiResponse,
} from './ptc.shared';

export interface AdCardProps {
  ad: PtcAd;
  storeSession: ReturnType<typeof usePtcSessionStore.getState>['session'];
  storeStatus: ReturnType<typeof usePtcSessionStore.getState>['status'];
  isStarting: boolean;
  onStart: (ad: PtcAd) => void;
  onGoToSession: () => void;
  resetCountdownLabel: string;
}

export const AdCard = memo(function AdCard({
  ad, storeSession, storeStatus, isStarting, onStart, onGoToSession, resetCountdownLabel,
}: AdCardProps) {
  const { t } = useTranslation();
  const isThisAdActive = storeSession?.adId === ad.id;
  const hasOtherSession = Boolean(storeSession) && !isThisAdActive;
  const viewedToday = Boolean(ad.viewedToday) && !isThisAdActive;
  const remainingViews = Math.max(0, (ad.targetViews ?? 0) - (ad.views ?? 0));

  const badge = useMemo(() => {
    if (viewedToday) {
      return { label: t('ptc.badge_viewed_today'), cls: 'bg-gray-500/15 text-gray-400 border-gray-500/25' };
    }
    if (isThisAdActive) {
      if (storeStatus === 'completed') return { label: t('ptc.badge_completed'), cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' };
      if (storeStatus === 'paused')    return { label: t('ptc.badge_paused'),   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' };
      if (storeStatus === 'opening')   return { label: t('ptc.badge_opening'),   cls: 'bg-orange-500/15 text-orange-400 border-orange-500/25' };
      return { label: t('ptc.badge_in_progress'), cls: 'bg-sky-500/15 text-sky-400 border-sky-500/25' };
    }
    return { label: t('ptc.badge_available'), cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' };
  }, [isThisAdActive, storeStatus, viewedToday, t]);

  const btn = useMemo(() => {
    if (viewedToday) {
      return {
        label: t('ptc.btn_reset_in', { time: resetCountdownLabel }),
        cls: 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-80',
        icon: Timer,
        action: 'none' as const,
      };
    }
    if (isThisAdActive) {
      if (storeStatus === 'completed') return { label: t('ptc.btn_claim_reward'), cls: 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20', icon: Gift, action: 'session' as const };
      if (storeStatus === 'viewing')   return { label: t('ptc.btn_view_progress'), cls: 'bg-sky-600 hover:bg-sky-500 shadow-sky-600/20', icon: PlayCircle, action: 'session' as const };
      if (storeStatus === 'paused')    return { label: t('ptc.btn_awaiting_return'), cls: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20', icon: PauseCircle, action: 'session' as const };
      return { label: t('ptc.btn_opening'), cls: 'bg-orange-600 opacity-70 cursor-wait', icon: Loader2, action: 'none' as const };
    }
    if (isStarting) return { label: t('ptc.btn_starting'), cls: 'bg-orange-500 cursor-wait', icon: Loader2, action: 'none' as const };
    if (hasOtherSession) return { label: t('ptc.btn_open_ad'), cls: 'bg-gray-700 opacity-40 cursor-not-allowed', icon: ExternalLink, action: 'none' as const };
    return { label: t('ptc.btn_open_ad'), cls: 'bg-orange-500 hover:bg-orange-400 shadow-orange-500/20', icon: ExternalLink, action: 'start' as const };
  }, [isThisAdActive, storeStatus, isStarting, hasOtherSession, viewedToday, resetCountdownLabel, t]);

  function handleBtnClick(e: MouseEvent<HTMLButtonElement>) {
    if (!validateTrustedEvent(e)) {
      toast.error(t('ptc.session_start_error'));
      return;
    }
    if (btn.action === 'start') onStart(ad);
    else if (btn.action === 'session') onGoToSession();
  }

  const BtnIcon = btn.icon;

  return (
    <article
      className={`group bg-surface border rounded-3xl overflow-hidden flex flex-col transition-all duration-300 ${
        viewedToday
          ? 'border-gray-800/60 opacity-75'
          : isThisAdActive
          ? 'border-sky-500/30 shadow-lg shadow-sky-500/10 ring-1 ring-sky-500/10 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/40'
          : 'border-gray-800/50 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/40 hover:border-gray-700/70'
      }`}
    >
      <SitePreview url={ad.url} title={ad.title} isActive={isThisAdActive} />

      <div className="flex flex-col flex-1 p-5 gap-3">
        {/* Title + badge */}
        <div>
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="text-white font-black text-sm uppercase italic tracking-tight leading-tight line-clamp-1 flex-1">
              {ad.title}
            </h3>
            <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-gray-500 text-xs font-medium leading-relaxed line-clamp-2 min-h-[2.5rem]">
            {ad.description || <span className="text-gray-700 italic">{t('ptc.no_description')}</span>}
          </p>
        </div>

        {/* Stats chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-800/70 rounded-lg px-2 py-1">
            <Timer className="w-3 h-3 text-gray-500" />
            <span className="text-gray-400 text-[10px] font-bold tabular-nums">{ad.durationSeconds}s</span>
          </div>
          {ad.targetViews != null && (
            <div className="flex items-center gap-1 bg-gray-800/70 rounded-lg px-2 py-1">
              <Eye className="w-3 h-3 text-gray-500" />
              <span className="text-gray-400 text-[10px] font-bold tabular-nums">
                {t('ptc.remaining_views', { count: remainingViews.toLocaleString() })}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2 py-1 ml-auto">
            <img
              src="/media/brand/shib.webp"
              alt=""
              className="w-3 h-3 rounded-full"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="text-orange-300 font-black text-[10px] tabular-nums">
              +{Number(ad.rewardPerViewShib).toLocaleString(undefined, { maximumFractionDigits: 0 })} SHIB
            </span>
          </div>
        </div>

        {/* Push button to bottom */}
        <div className="flex-1" />

        {/* CTA button */}
        {viewedToday ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-900/60 px-4 py-3 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
              {t('ptc.available_after_utc_reset')}
            </p>
            <p className="mt-1 text-xs font-medium text-gray-400 tabular-nums">{resetCountdownLabel}</p>
          </div>
        ) : (
          <button
            onClick={handleBtnClick}
            disabled={btn.action === 'none'}
            aria-label={btn.label}
            className={`w-full py-3.5 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg ${btn.cls} disabled:pointer-events-none`}
          >
            <BtnIcon className={`w-4 h-4 ${btn.icon === Loader2 ? 'animate-spin' : ''}`} />
            {btn.label}
          </button>
        )}
      </div>
    </article>
  );
});

// ── Ad grid view ──────────────────────────────────────────────────────────────

export function AdGridView({
  onSelectAd,
}: { onSelectAd: (ad: PtcAd) => void }) {
  const { t } = useTranslation();
  const [ads, setAds] = useState<PtcAd[]>([]);
  const [daily, setDaily] = useState<PtcDailyReset | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<number | null>(null);
  const { label: resetCountdownLabel } = useUtcDailyResetCountdown(daily?.nextResetInMs);

  const storeSession = usePtcSessionStore((s) => s.session);
  const storeStatus  = usePtcSessionStore((s) => s.status);
  const setStoreSession = usePtcSessionStore((s) => s.setSession);

  const loadAds = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; ads: PtcAd[]; daily?: PtcDailyReset }>('/ptc/ads');
      setAds(res.data.ads ?? []);
      setDaily(res.data.daily ?? null);
    } catch {
      toast.error(t('ptc.ads_load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void loadAds(); }, [loadAds]);

  async function handleStart(ad: PtcAd) {
    if (storeSession) {
      toast.error(t('ptc.already_active_ad'));
      return;
    }
    setStarting(ad.id);
    try {
      const res = await api.post<{ ok: boolean; session: { id: string } }>('/ptc/session/start', { adId: ad.id });
      if (!res.data.ok) { toast.error(t('ptc.session_start_failed')); return; }

      setStoreSession(
        {
          sessionId: res.data.session.id,
          adId: ad.id,
          adTitle: ad.title,
          adUrl: ad.url,
          adType: ad.adType,
          requiredSeconds: ad.durationSeconds,
          rewardShib: ad.rewardPerViewShib,
        },
        'opening',
        0,
      );

      if (ad.adType === 'window') {
        window.open(ad.url, '_blank', 'noopener,noreferrer');
      }

      onSelectAd(ad);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? t('ptc.session_start_error'));
    } finally {
      setStarting(null);
    }
  }

  if (loading) return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Stats skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-surface border border-gray-800/50 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="h-4 w-32 bg-gray-800 rounded animate-pulse" />
      {/* Cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );

  const availableAds = ads.filter((a) => a.availableToday !== false && !a.viewedToday);

  if (ads.length === 0) return (
    <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-16 text-center space-y-5">
      <div className="w-20 h-20 bg-gray-800/50 rounded-full flex items-center justify-center mx-auto">
        <Eye className="w-9 h-9 text-gray-700" />
      </div>
      <div>
        <h3 className="text-white font-black uppercase tracking-widest text-sm mb-2">{t('ptc.empty_ads_title')}</h3>
        <p className="text-gray-600 text-xs font-medium max-w-xs mx-auto leading-relaxed">
          {t('ptc.empty_ads_hint')}
        </p>
      </div>
      <button
        onClick={() => void loadAds()}
        className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl transition-colors"
      >
        <RefreshCw className="w-4 h-4" /> {t('ptc.check_again')}
      </button>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {daily ? <UtcResetBanner utcDate={daily.utcDate} initialMs={daily.nextResetInMs} /> : null}

      <StatsStrip ads={ads} />

      {availableAds.length === 0 && ads.length > 0 ? (
        <div className="rounded-2xl border border-gray-800/60 bg-gray-900/40 px-5 py-4 text-center">
          <p className="text-sm font-bold text-gray-300">{t('ptc.all_viewed_today')}</p>
          <p className="mt-1 text-xs text-gray-500">
            {t('ptc.available_next_reset')}{' '}
            <span className="font-black tabular-nums text-indigo-300">{resetCountdownLabel}</span>
          </p>
        </div>
      ) : null}

      {/* Active session banner */}
      {storeSession && (
        <button
          onClick={() => onSelectAd({ id: storeSession.adId } as PtcAd)}
          className="w-full flex items-center gap-3 px-5 py-4 bg-sky-500/5 border border-sky-500/20 rounded-2xl hover:border-sky-500/40 transition-colors text-left group/banner"
        >
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-2 h-2 bg-sky-400 rounded-full animate-pulse block" />
            <AlertCircle className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-xs text-sky-400/90 font-medium flex-1">
            {t('ptc.active_session_before')}{' '}
            <strong className="font-black">{t('ptc.active_session_cta')}</strong>{' '}
            {t('ptc.active_session_after')}
          </p>
          <PlayCircle className="w-4 h-4 text-sky-400 opacity-60 group-hover/banner:opacity-100 transition-opacity shrink-0" />
        </button>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-gray-600 text-xs font-bold uppercase tracking-widest">
          {availableAds.length === 1
            ? t('ptc.ads_available_one', { count: availableAds.length })
            : t('ptc.ads_available_other', { count: availableAds.length })}
        </p>
        <button
          onClick={() => void loadAds()}
          title={t('ptc.refresh_list')}
          className="p-2 rounded-xl text-gray-600 hover:text-white hover:bg-gray-800 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {ads.map((ad) => (
          <AdCard
            key={ad.id}
            ad={ad}
            storeSession={storeSession}
            storeStatus={storeStatus}
            isStarting={starting === ad.id}
            onStart={handleStart}
            onGoToSession={() => onSelectAd(ad)}
            resetCountdownLabel={resetCountdownLabel}
          />
        ))}
      </div>

      {/* Info note */}
      <div className="flex gap-3 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
          {t('ptc.info_note_before')}{' '}
          <strong className="text-orange-300">SHIB</strong>{' '}
          {t('ptc.info_note_mid')}{' '}
          <strong className="text-white">{t('ptc.info_note_limit')}</strong>{' '}
          {t('ptc.info_note_after')}
        </p>
      </div>
    </div>
  );
}

// ── Active session view ────────────────────────────────────────────────────────

export function ActiveSessionView({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const storeSession      = usePtcSessionStore((s) => s.session);
  const storeStatus       = usePtcSessionStore((s) => s.status);
  const setStatus         = usePtcSessionStore((s) => s.setStatus);
  const clearSession      = usePtcSessionStore((s) => s.clear);
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed]   = useState(false);

  const timerShouldRun = storeStatus === 'viewing' || storeStatus === 'paused';
  const elapsed = useActiveViewSeconds();

  const requiredSeconds = storeSession?.requiredSeconds ?? 0;
  const displayElapsed  = storeStatus === 'completed'
    ? requiredSeconds
    : Math.min(elapsed, requiredSeconds);
  const remaining        = Math.max(0, requiredSeconds - displayElapsed);
  const isTimerComplete  = storeStatus === 'completed' || (timerShouldRun && remaining <= 0);
  const progress         = requiredSeconds > 0 ? Math.min(100, (displayElapsed / requiredSeconds) * 100) : 0;

  useDocumentTitleCountdown({
    remainingSeconds: remaining,
    isPaused:  storeStatus === 'paused' || storeStatus === 'opening',
    isActive:  timerShouldRun || storeStatus === 'opening',
    isComplete: isTimerComplete,
    pageName: 'PTC',
  });

  const statusMeta = useMemo(() => {
    switch (storeStatus) {
      case 'opening':   return { label: t('ptc.status_opening_ad'), color: 'text-amber-400',   ring: 'ring-amber-500/30',   bg: 'from-amber-950/30',   Icon: Loader2 };
      case 'viewing':   return { label: t('ptc.status_viewing'),       color: 'text-sky-300',      ring: 'ring-sky-500/30',     bg: 'from-sky-950/30',     Icon: Eye };
      case 'paused':    return { label: t('ptc.badge_paused'),            color: 'text-amber-400',   ring: 'ring-amber-500/30',   bg: 'from-amber-950/30',   Icon: PauseCircle };
      case 'completed': return { label: t('ptc.status_completed_exclaim'),         color: 'text-emerald-400', ring: 'ring-emerald-500/30', bg: 'from-emerald-950/30', Icon: CheckCircle2 };
      case 'cancelled': return { label: t('ptc.status_cancelled'),          color: 'text-red-400',     ring: 'ring-red-500/30',     bg: 'from-red-950/30',     Icon: XCircle };
      default: return null;
    }
  }, [storeStatus, t]);

  async function handleClaim() {
    if (!storeSession || claiming) return;
    setClaiming(true);
    try {
      const res = await api.post<{ ok: boolean; message?: string }>(`/ptc/session/${storeSession.sessionId}/claim`);
      if (res.data.ok) {
        setStatus('claimed');
        setClaimed(true);
        toast.success(t('ptc.reward_credited', { amount: Number(storeSession.rewardShib).toLocaleString(undefined, { maximumFractionDigits: 4 }) }));
        setTimeout(() => { clearSession(); onDone(); }, 2500);
      } else {
        toast.error(res.data.message ?? t('ptc.claim_failed'));
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg ?? t('ptc.claim_reward_failed'));
      if (msg && /indisponível|registrada|expirada|reset|cancelada|hoje \(utc\)/i.test(msg)) {
        try {
          await api.post(`/ptc/session/${storeSession.sessionId}/cancel`, { reason: 'claim_failed' });
        } catch { /* non-fatal */ }
        clearSession();
        onDone();
      }
    } finally {
      setClaiming(false);
    }
  }

  async function handleCancel() {
    if (!storeSession) return;
    try {
      await api.post(`/ptc/session/${storeSession.sessionId}/cancel`, { reason: 'user_cancelled' });
    } catch { /* non-fatal */ }
    clearSession();
    onDone();
  }

  if (!storeSession) return null;

  const StatusIcon = statusMeta?.Icon ?? Eye;
  const domain     = extractDomain(storeSession.adUrl);
  const gradient   = domainToGradient(domain);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Back button */}
      <button
        onClick={() => {
          if (storeStatus === 'cancelled' || storeStatus === 'claimed') { clearSession(); onDone(); }
          else void handleCancel();
        }}
        className="flex items-center gap-1.5 text-gray-600 hover:text-white text-xs font-black uppercase tracking-widest transition-colors"
      >
        {t('ptc.back_to_list')}
      </button>

      {/* Main card */}
      <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] overflow-hidden">
        {/* Top gradient with site info */}
        <div className="relative px-8 pt-8 pb-6" style={{ background: gradient }}>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
          <div className="relative flex items-end justify-between gap-4">
            <div>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">{domain}</p>
              <h2 className="text-white font-black text-xl uppercase italic tracking-tight leading-tight">
                {storeSession.adTitle}
              </h2>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <div className="flex items-center gap-1.5 bg-orange-500/20 border border-orange-500/30 rounded-xl px-3 py-1.5 backdrop-blur-sm">
                <img
                  src="/media/brand/shib.webp"
                  alt=""
                  className="w-4 h-4 rounded-full"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="text-orange-300 font-black text-xs">
                  +{Number(storeSession.rewardShib).toLocaleString(undefined, { maximumFractionDigits: 4 })} SHIB
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* iframe viewer */}
        {storeSession.adType === 'iframe' && storeStatus !== 'idle' && (
          <div className="mx-6 mt-0 rounded-2xl overflow-hidden border border-gray-700 bg-gray-900">
            <iframe
              src={storeSession.adUrl}
              title={storeSession.adTitle}
              className="w-full"
              style={{ height: 250, border: 0 }}
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          </div>
        )}

        {/* Status + timer block */}
        <div className="p-6 space-y-5">
          {statusMeta && !claimed && (
            <div className={`rounded-2xl bg-gradient-to-b ${statusMeta.bg} to-transparent ring-1 ${statusMeta.ring} px-6 py-6 text-center space-y-4 transition-all duration-500`}>
              {/* Status label */}
              <p className={`text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 ${statusMeta.color}`}>
                <StatusIcon className={`w-3.5 h-3.5 ${storeStatus === 'opening' || storeStatus === 'viewing' ? 'animate-pulse' : ''}`} />
                {statusMeta.label}
              </p>

              {/* Timer */}
              {['opening', 'viewing', 'paused'].includes(storeStatus) && (
                <div className="space-y-3">
                  <div className="flex items-end justify-center gap-2">
                    <span className="text-5xl sm:text-6xl font-black tabular-nums tracking-tight text-white">
                      {fmtTime(displayElapsed)}
                    </span>
                    <span className="text-2xl text-gray-600 font-black tabular-nums mb-1">
                      / {fmtTime(requiredSeconds)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${
                        storeStatus === 'paused' ? 'bg-amber-500' : 'bg-sky-500 shadow-[0_0_8px_theme(colors.sky.500)]'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <p className="text-[11px] text-gray-600 font-medium">
                    {storeStatus === 'paused'
                      ? t('ptc.hint_paused')
                      : storeStatus === 'opening'
                        ? t('ptc.hint_opening')
                        : t('ptc.hint_viewing')}
                  </p>
                </div>
              )}

              {storeStatus === 'cancelled' && (
                <p className="text-sm text-red-400/70 font-medium">{t('ptc.cancelled_early')}</p>
              )}
            </div>
          )}

          {/* Cancel button */}
          {['opening', 'viewing', 'paused'].includes(storeStatus) && (
            <button
              onClick={() => void handleCancel()}
              className="w-full py-3 bg-gray-800/60 text-gray-500 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-gray-700/60 hover:text-white transition-colors"
            >
              {t('ptc.cancel_view')}
            </button>
          )}

          {/* Claim button */}
          {(storeStatus === 'completed' || isTimerComplete) && !claimed && (
            <button
              onClick={() => void handleClaim()}
              disabled={claiming}
              className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-widest rounded-2xl transition-all hover:scale-[1.02] flex items-center justify-center gap-3 text-sm italic shadow-xl shadow-emerald-600/25 animate-bounce disabled:opacity-70 disabled:scale-100 disabled:animate-none"
            >
              {claiming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gift className="w-5 h-5" />}
              {t('ptc.claim_shib')}
            </button>
          )}

          {/* Claimed state */}
          {claimed && (
            <div className="flex items-center justify-center gap-3 py-5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 animate-in fade-in duration-300">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              <span className="text-emerald-400 font-black uppercase italic tracking-tighter text-lg">{t('ptc.shib_credited')}</span>
              <Loader2 className="w-4 h-4 text-gray-600 animate-spin ml-2" />
            </div>
          )}
        </div>
      </div>

      {/* Tip */}
      <div className="flex gap-3 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
          {t('ptc.tip_timer_before')}{' '}
          <strong className="text-white">{t('ptc.tip_timer_strong')}</strong>
          {t('ptc.tip_timer_after')}
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

