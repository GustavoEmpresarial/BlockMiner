import type { KeyboardEvent, MouseEvent, RefObject } from 'react';
import type { TFunction } from 'i18next';
import { Youtube, Clock, AlertCircle, X, PauseCircle, PlayCircle, Loader2 } from 'lucide-react';
import type { PlayerUiState } from './youtubeWatch.parts';

export type YoutubeVideoPanelProps = {
    t: TFunction;
    url: string;
    videoId: string | null;
    playerState: PlayerUiState;
    ytApiReady: boolean;
    ytApiFailed: boolean;
    playerReady: boolean;
    isPaused: boolean;
    isActivelyWatching: boolean;
    watchBalance: number;
    minClaimSec: number;
    showClaimCountdown: boolean;
    countdownRemaining: number;
    urlInputRef: RefObject<HTMLInputElement | null>;
    playerDivRef: RefObject<HTMLDivElement | null>;
    setUrl: (value: string) => void;
    urlComposingRef: RefObject<boolean>;
    selectAllUrl: () => void;
    handleClearUrl: (e: MouseEvent<HTMLButtonElement>) => void;
    handleLoadVideo: (e: MouseEvent<HTMLButtonElement> | KeyboardEvent<HTMLInputElement>) => void;
    handleExternalYoutubeClick: () => void;
    handleResumeWatching: () => void;
    playerStateLabel: (state: PlayerUiState) => string;
};

export function YoutubeVideoPanel({
    t,
    url,
    videoId,
    playerState,
    ytApiReady,
    ytApiFailed,
    playerReady,
    isPaused,
    isActivelyWatching,
    watchBalance,
    minClaimSec,
    showClaimCountdown,
    countdownRemaining,
    urlInputRef,
    playerDivRef,
    setUrl,
    urlComposingRef,
    selectAllUrl,
    handleClearUrl,
    handleLoadVideo,
    handleExternalYoutubeClick,
    handleResumeWatching,
    playerStateLabel,
}: YoutubeVideoPanelProps) {
    return (
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="bg-surface border border-gray-800/50 rounded-2xl sm:rounded-[2.5rem] p-4 sm:p-8 shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-bl-[120px] -mr-20 -mt-20 group-hover:bg-red-500/10 transition-colors" />

                <div className="flex flex-col sm:flex-row gap-3 mb-6 sm:mb-8 relative z-10">
                    <div className="relative flex-1 min-w-0">
                        <input
                            ref={urlInputRef}
                            type="text"
                            value={url}
                            inputMode="url"
                            autoComplete="off"
                            spellCheck={false}
                            aria-label={t('youtube.url_placeholder')}
                            onChange={(e) => setUrl(e.target.value)}
                            onFocus={selectAllUrl}
                            onClick={selectAllUrl}
                            onCompositionStart={() => {
                                urlComposingRef.current = true;
                            }}
                            onCompositionEnd={() => {
                                urlComposingRef.current = false;
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleLoadVideo(e);
                            }}
                            placeholder={t('youtube.url_placeholder')}
                            className="w-full bg-gray-900/50 border border-gray-800 rounded-2xl py-3 sm:py-4 pl-4 sm:pl-6 pr-12 sm:pr-14 text-gray-200 text-sm focus:outline-none focus:border-primary/50 transition-all shadow-inner"
                        />
                        <button
                            type="button"
                            title={t('youtube.clear_url_tooltip')}
                            aria-label={t('youtube.clear_url_aria')}
                            aria-hidden={url.length === 0}
                            tabIndex={url.length > 0 ? 0 : -1}
                            disabled={url.length === 0}
                            onClick={handleClearUrl}
                            className={`absolute right-1.5 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 touch-manipulation items-center justify-center rounded-xl border border-gray-700/60 bg-gray-800/90 text-gray-400 shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-gray-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-95 disabled:pointer-events-none sm:right-2 sm:h-9 sm:w-9 ${
                                url.length > 0 ? 'opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-95'
                            }`}
                        >
                            <X className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={handleLoadVideo}
                        className="shrink-0 px-6 sm:px-8 py-3 sm:py-4 bg-primary hover:bg-primary-hover text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all italic shadow-lg shadow-primary/20"
                    >
                        {t('youtube.load_video')}
                    </button>
                </div>

                <div className="aspect-video bg-gray-900 rounded-[2rem] overflow-hidden border border-gray-800 relative group shadow-inner">
                    <div ref={playerDivRef} className="w-full h-full" />
                    {!videoId && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                            <Youtube className="w-20 h-20 mb-4 opacity-20" />
                            <p className="font-bold uppercase tracking-widest text-[10px]">{t('youtube.waiting_placeholder')}</p>
                        </div>
                    )}
                    {videoId && (!ytApiReady || !playerReady) && !ytApiFailed && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-950/90">
                            <Loader2 className="h-10 w-10 animate-spin text-primary" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                                {t('youtube.player_loading')}
                            </p>
                        </div>
                    )}
                    {videoId && ytApiFailed && (
                        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-gray-950/95 px-6 text-center">
                            <AlertCircle className="h-10 w-10 text-amber-400" />
                            <p className="text-sm text-gray-300">{t('youtube.api_load_failed')}</p>
                            <a
                                href={`https://www.youtube.com/watch?v=${videoId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-2 inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-black uppercase text-white"
                            >
                                <Youtube className="h-4 w-4" />
                                {t('youtube.open_on_youtube')}
                            </a>
                        </div>
                    )}
                    {videoId && (
                        <a
                            href={`https://www.youtube.com/watch?v=${videoId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleExternalYoutubeClick}
                            className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-black/70 hover:bg-red-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl border border-white/10 transition-all backdrop-blur-sm"
                        >
                            <Youtube className="w-3 h-3" /> {t('youtube.open_on_youtube')}
                        </a>
                    )}
                </div>

                {videoId && playerState === 'ended' && (
                    <div className="mt-4 flex items-start gap-3 p-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 relative z-10">
                        <PlayCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-100/90 font-medium leading-relaxed">
                            {t('youtube.video_ended_hint')}
                        </p>
                    </div>
                )}

                {isPaused && (
                    <div className="mt-4 relative z-10 flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                        <PauseCircle className="w-6 h-6 text-amber-400 shrink-0" />
                        <div className="flex-1">
                            <p className="text-xs font-black text-amber-300 uppercase tracking-widest">
                                {t('youtube.paused_title')}
                            </p>
                            <p className="text-[11px] text-amber-200/80 mt-0.5">
                                {t('youtube.paused_hint')}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleResumeWatching}
                            className="px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-primary text-white hover:bg-primary-hover active:scale-95 flex items-center justify-center gap-2 shrink-0"
                        >
                            <PlayCircle className="w-4 h-4" />
                            {t('youtube.resume_button')}
                        </button>
                    </div>
                )}

                {videoId && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 relative z-10">
                        <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                                isActivelyWatching
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                    : playerState === 'paused'
                                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                      : playerState === 'ended'
                                        ? 'bg-gray-800 border-gray-700 text-gray-400'
                                        : 'bg-gray-800/80 border-gray-700 text-gray-500'
                            }`}
                        >
                            {isActivelyWatching ? (
                                <Clock className="w-3 h-3" />
                            ) : playerState === 'paused' ? (
                                <PauseCircle className="w-3 h-3" />
                            ) : (
                                <PlayCircle className="w-3 h-3" />
                            )}
                            {playerStateLabel(playerState)}
                        </span>
                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                            {t('youtube.tracker_verified_seconds')}:{' '}
                            <span className={watchBalance >= minClaimSec ? 'text-emerald-400' : 'text-white'}>
                                {watchBalance}s
                            </span>
                            {' / '}
                            {minClaimSec}s
                        </span>
                    </div>
                )}

                <div className="mt-4 sm:mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
                    <div className="flex items-center gap-4">
                        {showClaimCountdown && (
                            <div className="flex items-center gap-3 px-6 py-4 bg-gray-800/50 rounded-2xl border border-gray-700/50 shadow-inner">
                                <Clock className={`w-4 h-4 text-primary ${isActivelyWatching ? 'animate-pulse' : ''}`} />
                                <span className="text-sm font-bold text-white uppercase italic tracking-tighter">
                                    {t('youtube.next_claim', { seconds: Math.ceil(countdownRemaining) })}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="text-[10px] text-gray-500 italic font-medium max-w-[220px] text-right flex items-start gap-1">
                        <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 text-amber-500/60" />
                        <span>
                            {t('youtube.embed_hint_before')}{' '}
                            <strong className="text-white">{t('youtube.open_on_youtube')}</strong>{' '}
                            {t('youtube.embed_hint_after')}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
