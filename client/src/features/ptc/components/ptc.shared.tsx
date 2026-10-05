import { useState, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Eye, Timer, CheckCircle2, Gift, Loader2, ExternalLink,
  Info, Megaphone, AlertCircle, PauseCircle, XCircle, RefreshCw,
  Globe, PlayCircle,
} from 'lucide-react';
import { useUtcDailyResetCountdown } from '../../../shared/hooks/useUtcDailyResetCountdown';
import StatCard from '../../../shared/components/StatCard';
import type { PtcAd, PtcDailyReset, PtcSettings, SessionApiResponse } from '../ptc.types';

export type { PtcAd, PtcDailyReset, PtcSettings, SessionApiResponse };

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

export function domainToGradient(domain: string): string {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 40) % 360;
  return `linear-gradient(135deg, hsl(${h1},40%,14%), hsl(${h2},50%,10%))`;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

export function SkeletonCard() {
  return (
    <div className="bg-slate-900/60 border-2 border-slate-800 rounded-3xl overflow-hidden shadow-[4px_4px_0px_#000000] animate-pulse">
      <div className="aspect-video bg-slate-800/80" />
      <div className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="h-4 bg-slate-800 rounded w-3/5" />
          <div className="h-5 bg-slate-800 rounded-full w-16" />
        </div>
        <div className="h-3 bg-slate-800 rounded w-full" />
        <div className="h-3 bg-slate-800 rounded w-4/5" />
        <div className="flex gap-2 pt-1">
          <div className="h-6 bg-slate-800 rounded-lg w-14" />
          <div className="h-6 bg-slate-800 rounded-lg w-24" />
          <div className="h-6 bg-slate-800 rounded-lg w-20 ml-auto" />
        </div>
        <div className="h-11 bg-slate-800 rounded-xl mt-1" />
      </div>
    </div>
  );
}

// ── Site preview (favicon + gradient, iframe fallback) ────────────────────────

export const SitePreview = memo(function SitePreview({ url, isActive }: { url: string; title: string; isActive?: boolean }) {
  const [faviconError, setFaviconError] = useState(false);
  const domain = useMemo(() => extractDomain(url), [url]);
  const gradient = useMemo(() => domainToGradient(domain), [domain]);
  const faviconUrl = domain
    ? `https://www.google.com/s2/favicons?sz=64&domain=${domain}`
    : '';

  return (
    <div
      className="relative aspect-video shrink-0 rounded-t-[22px] overflow-hidden"
      style={{ background: gradient }}
    >
      {/* Gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-black/40" />

      {/* Favicon + domain */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
        {!faviconError && faviconUrl ? (
          <img
            src={faviconUrl}
            alt=""
            loading="lazy"
            className="w-14 h-14 rounded-2xl shadow-2xl ring-2 ring-white/10 bg-white/5"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-white/5 ring-2 ring-white/10 flex items-center justify-center">
            <Globe className="w-7 h-7 text-white/30" />
          </div>
        )}
        <span className="text-white/40 text-[11px] font-medium tracking-wide">{domain}</span>
      </div>

      {/* Active session pulse badge */}
      {isActive && (
        <div className="absolute top-3 right-3">
          <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1 border border-sky-500/40">
            <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse block" />
            <span className="text-sky-300 text-[9px] font-black uppercase tracking-widest">Ativo</span>
          </div>
        </div>
      )}

      {/* External link hint on hover */}
      <div className="absolute bottom-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-2 py-0.5">
          <ExternalLink className="w-2.5 h-2.5 text-white/50" />
          <span className="text-white/40 text-[9px] font-medium">abre em nova aba</span>
        </div>
      </div>
    </div>
  );
});

// ── Stats strip ───────────────────────────────────────────────────────────────

export function UtcResetBanner({ utcDate, initialMs }: { utcDate: string; initialMs?: number }) {
  const { t } = useTranslation();
  const { label } = useUtcDailyResetCountdown(initialMs);
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-indigo-500/30 bg-indigo-950/20 px-5 py-4 shadow-[2px_2px_0px_#000000] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
          {t('ptc.daily_reset_utc', { date: utcDate })}
        </p>
        <p className="mt-1 text-xs font-medium text-slate-400">
          {t('ptc.rules_once_day')}{' '}
          {t('ptc.rules_reset')}
        </p>
      </div>
      <div className="shrink-0 text-left sm:text-right">
        <p className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">{t('ptc.next_reset')}</p>
        <p className="text-lg font-black tabular-nums text-indigo-300 font-mono">{label}</p>
      </div>
    </div>
  );
}

export function StatsStrip({ ads }: { ads: PtcAd[] }) {
  const { t } = useTranslation();
  const available = ads.filter((a) => a.availableToday !== false && !a.viewedToday);
  const totalReward = available.reduce((s, a) => s + Number(a.rewardPerViewShib), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <StatCard
        icon={Eye}
        label={t('ptc.available_today')}
        value={available.length}
        accent="text-sky-400"
      />
      <StatCard
        icon={
          <img
            src="/media/brand/shib.webp"
            alt=""
            className="w-4 h-4 rounded-full"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        }
        label={t('ptc.total_earn')}
        value={
          <>
            +{totalReward.toLocaleString(undefined, { maximumFractionDigits: 0 })}{' '}
            <span className="text-xs font-bold text-slate-400 not-italic uppercase">SHIB</span>
          </>
        }
      />
    </div>
  );
}

// ── Ad card ───────────────────────────────────────────────────────────────────

