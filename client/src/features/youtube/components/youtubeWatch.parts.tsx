import { useEffect } from 'react';
import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import { Zap, Clock, TrendingUp, History, BarChart3, ShieldCheck } from 'lucide-react';
import { formatHashrate } from '../../machines/lib/machines.shared';
import { useBrazilDailyResetCountdown } from '../../../shared/hooks/useBrazilDailyResetCountdown';

import type {
  TrackerColor,
  YoutubeDailyReset,
  YoutubeStatsPayload,
  YoutubeStatusPayload,
} from '../lib/youtubeWatch.types';


export const CLAIM_INTERVAL_SEC = 60;
/** Survives the unmount that happens when the user navigates away from this page. */
export const YT_PAUSED_KEY = 'yt_watch_paused';
/** How long focus must stay away before counting as "the user left". */
export const BLUR_PAUSE_GRACE_MS = 8000;
export const YOUTUBE_VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export function isValidYoutubeVideoId(id: string | null | undefined): id is string {
    return typeof id === 'string' && YOUTUBE_VIDEO_ID_RE.test(id);
}

export function normalizeVideoId(candidate: string | null | undefined): string | null {
    const id = String(candidate ?? '').trim();
    return isValidYoutubeVideoId(id) ? id : null;
}

export function extractVideoId(input: unknown): string | null {
    const raw = String(input || "").trim();

    // 1. Check if it's already an 11-char ID
    const direct = normalizeVideoId(raw);
    if (direct) return direct;

    // 2. Try to parse as URL
    try {
        const urlObj = new URL(raw);
        const hostname = urlObj.hostname.replace(/^www\./, "").toLowerCase();

        // youtu.be/ID
        if (hostname === "youtu.be") {
            const fromPath = normalizeVideoId(urlObj.pathname.slice(1).split(/[?#&]/)[0]);
            if (fromPath) return fromPath;
        }

        if (hostname === "youtube.com" || hostname === "m.youtube.com") {
            // /watch?v=ID
            if (urlObj.pathname === "/watch") {
                const fromQuery = normalizeVideoId(urlObj.searchParams.get("v"));
                if (fromQuery) return fromQuery;
            }
            // /embed/ID, /v/ID, /shorts/ID, /live/ID
            const parts = urlObj.pathname.split("/");
            if (["embed", "v", "shorts", "live"].includes(parts[1])) {
                const fromPath = normalizeVideoId(parts[2]);
                if (fromPath) return fromPath;
            }
        }
    } catch {
        // Ignore URL parsing errors and try regex
    }

    // 3. Robust Regex Fallback (handles most common formats including timestamps and feature params)
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = raw.match(regex);
    if (match?.[1]) return normalizeVideoId(match[1]);

    return null;
}

export type PlayerUiState = 'idle' | 'cued' | 'playing' | 'buffering' | 'paused' | 'ended';

/** A reload starts the page over — the video is gone and nothing is counting, so coming back
 *  to a "you left the page" banner makes no sense. Only a real reload clears it; returning from
 *  another route must keep the pause. */
export function readPausedFlag(key: string): boolean {
    try {
        const navType = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
        if (navType === 'reload') {
            sessionStorage.removeItem(key);
            return false;
        }
        return sessionStorage.getItem(key) === '1';
    } catch {
        return false;
    }
}


export function TrackerItem({
    label,
    value,
    icon: Icon,
    color,
}: {
    label: string;
    value: string;
    icon: LucideIcon;
    color: TrackerColor;
}) {
    const colorMap: Record<TrackerColor, string> = {
        primary: 'text-primary bg-primary/10',
        amber: 'text-amber-500 bg-amber-500/10',
        blue: 'text-blue-500 bg-blue-500/10',
        emerald: 'text-emerald-500 bg-emerald-500/10',
    };
    return (
        <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${colorMap[color]} group-hover:scale-110 transition-transform`}>
                    <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
            </div>
            <span className="text-sm font-black text-white italic">{value}</span>
        </div>
    );
}

export function YoutubeDailyResetBanner({
    dailyReset,
    t,
    onResetElapsed,
}: {
    dailyReset: YoutubeDailyReset;
    t: TFunction;
    onResetElapsed: () => Promise<void>;
}) {
    const { label, remainingMs } = useBrazilDailyResetCountdown(dailyReset.nextResetInMs);

    useEffect(() => {
        if (remainingMs > 0) return undefined;
        void onResetElapsed();
        return undefined;
    }, [remainingMs, onResetElapsed]);

    return (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/90">
                    {t('youtube.daily_reset_title', { date: dailyReset.localDate })}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-400">{t('youtube.daily_reset_body')}</p>
            </div>
            <div className="shrink-0 text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{t('youtube.daily_reset_next')}</p>
                <p className="text-lg font-black tabular-nums text-emerald-300">{label}</p>
            </div>
        </div>
    );
}

export type YoutubeTrackerSidebarProps = {
    t: TFunction;
    showClaimCountdown: boolean;
    countdownRemaining: number;
    watchBalance: number;
    status: YoutubeStatusPayload | null;
    stats: YoutubeStatsPayload | null;
    dailyHashUsed: number;
    dailyLimitHash: number;
    dailyHashRemaining: number;
    activeHashTotal: number;
    claimsToday: number;
    dailyProgress: number;
};

export function YoutubeTrackerSidebar({
    t,
    showClaimCountdown,
    countdownRemaining,
    watchBalance,
    status,
    stats,
    dailyHashUsed,
    dailyLimitHash,
    dailyHashRemaining,
    activeHashTotal,
    claimsToday,
    dailyProgress,
}: YoutubeTrackerSidebarProps) {
    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="bg-surface border border-gray-800/50 rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -mr-10 -mt-10" />

                <h3 className="text-sm font-black text-white uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" /> {t('youtube.tracker_title')}
                </h3>

                <div className="space-y-6 relative z-10">
                    <TrackerItem
                        label={t('youtube.tracker_next')}
                        value={showClaimCountdown ? `${Math.ceil(countdownRemaining)}s` : '--'}
                        icon={Clock}
                        color="primary"
                    />
                    <TrackerItem
                        label={t('youtube.tracker_verified_seconds')}
                        value={`${watchBalance}s`}
                        icon={ShieldCheck}
                        color="blue"
                    />
                    <TrackerItem label={t('youtube.tracker_per_minute')} value={formatHashrate(Number(status?.rewardGh || 10))} icon={Zap} color="amber" />
                    <TrackerItem label={t('youtube.tracker_duration')} value={`${Number(status?.durationMin || 1440)} min`} icon={History} color="blue" />
                    <div className="h-[1px] bg-gray-800 w-full my-2" />
                    <TrackerItem label={t('youtube.tracker_bonus')} value={formatHashrate(status?.activeHashRate || 0)} icon={TrendingUp} color="emerald" />
                </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 space-y-6 shadow-2xl">
                <div className="space-y-4">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">{t('youtube.stats_claims_today')}</span>
                        <span className="text-white">{claimsToday}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">{t('youtube.stats_hash_today')}</span>
                        <span className="text-emerald-400">{formatHashrate(dailyHashUsed)} / {formatHashrate(dailyLimitHash)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">{t('youtube.stats_hash_remaining')}</span>
                        <span className="text-gray-400">{formatHashrate(dailyHashRemaining)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">{t('youtube.stats_active_hash')}</span>
                        <span className="text-primary">{formatHashrate(activeHashTotal)}</span>
                    </div>
                    <p className="text-[9px] text-gray-600 font-bold uppercase leading-relaxed">{t('youtube.stats_active_hash_note')}</p>

                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-[9px] font-bold text-gray-600 uppercase">{t('youtube.stats_daily_progress')}</span>
                            <span className="text-[9px] font-bold text-gray-400">{dailyProgress.toFixed(1)}%</span>
                        </div>
                        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden border border-white/5 shadow-inner">
                            <div
                                className="h-full bg-gradient-to-r from-primary to-blue-500 transition-all duration-1000"
                                style={{ width: `${Math.min(100, dailyProgress)}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                <div className="h-[1px] bg-gray-800 w-full" />

                <div className="space-y-4">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">{t('youtube.stats_claims_all')}</span>
                        <span className="text-white">{stats?.claimsTotal || 0}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">{t('youtube.stats_hash_all')}</span>
                        <span className="text-primary">{formatHashrate(Number(stats?.hashGrantedTotal || 0))}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
