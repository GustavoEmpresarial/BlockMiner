import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import {
    Link as LinkIcon,
    Zap,
    AlertCircle,
    ShieldCheck,
    Clock,
    ArrowRight,
    Loader2,
    ExternalLink,
} from 'lucide-react';
import { api } from '../../shared/auth/auth.store';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import PowerBoostBanner from '../../shared/components/PowerBoostBanner';
import { reportApiFailure } from '../../shared/utils/reportApiFailure';
import { useBrazilDailyResetCountdown } from '../../shared/hooks/useBrazilDailyResetCountdown';
import {
    fetchShortlinkStatus,
    type InternalShortlinkStatusPayload,
    type PasteadStatusPayload,
    type ExternalShortlinkStatusPayload,
    type ShortlinkDailyReset,
} from './lib/shortlinks.api';
import { useZeradsShortlink } from './lib/useZeradsShortlink';
import { useAdlinkflyShortlink } from './lib/useAdlinkflyShortlink';

interface ShortlinkStartResponse {
    ok?: boolean;
    sessionToken?: string;
}

export default function Shortlinks() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [status, setStatus] = useState<InternalShortlinkStatusPayload | null>(null);
    const [pastead, setPastead] = useState<PasteadStatusPayload | null>(null);
    const [adlinkfly, setAdlinkfly] = useState<ExternalShortlinkStatusPayload | null>(null);
    const [dailyReset, setDailyReset] = useState<ShortlinkDailyReset | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isStarting, setIsStarting] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetchShortlinkStatus();
            if (res.ok && res.status) {
                setStatus(res.status);
                setPastead(res.pastead ?? null);
                setAdlinkfly(res.adlinkfly ?? null);
                setDailyReset(res.dailyReset ?? null);
            }
        } catch (err: unknown) {
            console.error("Erro ao buscar status do shortlink", err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const zerads = useZeradsShortlink(pastead, setPastead, fetchStatus);
    const adl = useAdlinkflyShortlink(adlinkfly, setAdlinkfly, fetchStatus);

    const handleStart = async () => {
        if (!status || isStarting) return;

        try {
            setIsStarting(true);
            const res = await api.post<ShortlinkStartResponse>('/shortlink/start');
            if (res.data.ok && res.data.sessionToken) {
                const initialSession = {
                    token: res.data.sessionToken,
                    currentStep: 1
                };
                sessionStorage.setItem('sl_session', JSON.stringify(initialSession));
                sessionStorage.removeItem('sl_paused');
                navigate("/shortlink/internal-shortlink/step/1");
            }
        } catch (err: unknown) {
            const msg =
                isAxiosError(err) &&
                err.response?.data &&
                typeof err.response.data === 'object' &&
                err.response.data !== null &&
                'message' in err.response.data &&
                typeof (err.response.data as { message?: unknown }).message === 'string'
                    ? (err.response.data as { message: string }).message
                    : t('common.error');
            toast.error(msg);
            reportApiFailure({
                operation: 'shortlink_start',
                message: typeof msg === 'string' && msg !== t('common.error') ? msg : 'shortlink_start_failed',
                statusCode: isAxiosError(err) ? err.response?.status : undefined,
            });
        } finally {
            setIsStarting(false);
        }
    };

    if (isLoading) return <div className="p-8 text-gray-400">{t('common.loading')}</div>;

    const runsToday = status?.dailyRuns || 0;
    const maxRuns = status?.maxDailyRuns || 1;
    const isLimitReached = runsToday >= maxRuns && (status?.currentStep || 0) === 0;
    const inProgress = status?.inProgress;

    const pasteadLimitReached = pastead?.enabled && pastead.available === false;
    const pasteadPending = Boolean(pastead?.pending);
    const pasteadRuns = pastead?.dailyRuns ?? 0;
    const pasteadMaxRuns = pastead?.maxDailyRuns ?? 50;

    const adlinkflyLimitReached = adlinkfly?.enabled && adlinkfly.available === false;
    const adlinkflyPending = Boolean(adlinkfly?.pending);
    const adlinkflyRuns = adlinkfly?.dailyRuns ?? 0;
    const adlinkflyMaxRuns = adlinkfly?.maxDailyRuns ?? 50;

    const showPasteadMaintenance = pastead != null && (!pastead.enabled || pastead.maintenance);
    const showAdlinkflyMaintenance =
        adlinkfly != null && (!adlinkfly.enabled || adlinkfly.maintenance);

    return (
        <div className=" space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <PowerBoostBanner />
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="inline-flex p-3 bg-blue-500/10 rounded-2xl">
                        <LinkIcon className="w-6 h-6 text-blue-400" />
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">{t('shortlinks.title')}</h1>
                    <p className="text-gray-500 font-medium">{t('shortlinks.subtitle')}</p>
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-800/50 border border-gray-700/50 rounded-xl">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('shortlinks.verified_links')}</span>
                </div>
            </div>

            {dailyReset ? <ShortlinkDailyResetBanner dailyReset={dailyReset} t={t} onResetElapsed={fetchStatus} /> : null}

            <div className="grid grid-cols-1 gap-6">
                {pastead?.enabled ? (
                    <div
                        className={`bg-surface border rounded-[2.5rem] p-10 shadow-xl transition-all duration-500 ${
                            pasteadLimitReached ? 'border-gray-800 opacity-80' : 'border-amber-500/20 hover:border-amber-500/40'
                        }`}
                    >
                        <div className="flex flex-col md:flex-row justify-between gap-8">
                            <div className="space-y-6 flex-1">
                                <div className="flex items-center gap-4">
                                    <div className="p-4 bg-gray-900/50 rounded-2xl border border-gray-800">
                                        <ExternalLink className="w-8 h-8 text-amber-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-white">{pastead.shortlinkName || 'ZerAds Shortlink'}</h3>
                                        <p className="text-sm font-bold text-amber-400 mt-1">
                                            {t('shortlinks.reward')}: {pastead.rewardName || '+20 H/s por 24h'}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1 font-medium">
                                            {t('shortlinks.pastead_cap', {
                                                earned: pastead.dailyHsEarned ?? 0,
                                                cap: pastead.dailyHsCap ?? 1000,
                                            })}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.status_label')}</p>
                                        <p
                                            className={`text-sm font-bold ${
                                                pasteadLimitReached
                                                    ? 'text-red-400'
                                                    : pasteadPending
                                                      ? 'text-amber-400'
                                                      : 'text-emerald-400'
                                            }`}
                                        >
                                            {t(
                                                pasteadLimitReached
                                                    ? 'shortlinks.limit_reached'
                                                    : pasteadPending
                                                      ? zerads.isAutoClaiming
                                                          ? 'shortlinks.pastead_status_validating'
                                                          : 'shortlinks.pastead_status_pending'
                                                      : 'shortlinks.available',
                                            )}
                                        </p>
                                    </div>
                                    <div className="bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.daily_usage')}</p>
                                        <p className="text-sm font-bold text-white">
                                            {pasteadRuns} / {pasteadMaxRuns}
                                        </p>
                                    </div>
                                    <div className="hidden md:block bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.difficulty')}</p>
                                        <div className="flex gap-1 mt-1">
                                            <div className="w-3 h-1.5 bg-amber-400 rounded-full" />
                                            <div className="w-3 h-1.5 bg-amber-400 rounded-full" />
                                            <div className="w-3 h-1.5 bg-gray-700 rounded-full" />
                                        </div>
                                    </div>
                                </div>

                                {pasteadPending ? (
                                    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                                        <p className="text-xs font-medium text-amber-200/90 leading-relaxed">
                                            {t(
                                                zerads.isAutoClaiming
                                                    ? zerads.claimPhase === 'waiting'
                                                        ? 'shortlinks.pastead_claim_waiting_hint'
                                                        : 'shortlinks.pastead_auto_validating_hint'
                                                    : 'shortlinks.pastead_pending_hint',
                                            )}
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500 font-medium leading-relaxed">{t('shortlinks.pastead_help')}</p>
                                )}
                            </div>

                            <div className="flex flex-col justify-center gap-3 md:w-64">
                                {pasteadLimitReached ? (
                                    <div className="p-6 bg-red-500/5 border border-red-500/10 rounded-3xl text-center space-y-2">
                                        <Clock className="w-8 h-8 text-red-400 mx-auto" />
                                        <p className="text-xs font-bold text-gray-400">{t('shortlinks.wait_reset')}</p>
                                    </div>
                                ) : pasteadPending ? (
                                    <div className="space-y-3">
                                        {zerads.isAutoClaiming ? (
                                            <div className="w-full py-6 bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-[2rem] font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3">
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                {t(
                                                    zerads.claimPhase === 'waiting'
                                                        ? 'shortlinks.pastead_claim_waiting'
                                                        : 'shortlinks.pastead_auto_validating',
                                                )}
                                            </div>
                                        ) : (
                                            <div className="w-full py-5 px-4 bg-gray-900/40 border border-amber-500/20 rounded-[2rem] text-center">
                                                <p className="text-xs font-bold text-amber-200/80 leading-relaxed">
                                                    {t('shortlinks.pastead_waiting_popup')}
                                                </p>
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => void zerads.handleReopen()}
                                            disabled={zerads.isStarting || zerads.isAutoClaiming}
                                            className="w-full py-3 text-xs font-bold uppercase tracking-widest text-amber-300/60 hover:text-amber-200 transition-colors disabled:opacity-50"
                                        >
                                            {t('shortlinks.pastead_reopen_link')}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void zerads.handleStart()}
                                        disabled={zerads.isStarting}
                                        className="w-full py-6 bg-amber-500 hover:bg-amber-400 text-black rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-amber-500/20 active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60"
                                    >
                                        {zerads.isStarting ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                {t('shortlinks.starting')}
                                            </>
                                        ) : (
                                            <>
                                                {t('shortlinks.pastead_start')}
                                                <ExternalLink className="w-5 h-5" />
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ) : showPasteadMaintenance ? (
                    <ExternalShortlinkMaintenanceCard
                        title={pastead?.shortlinkName || 'ZerAds Shortlink'}
                        messageKey="shortlinks.pastead_maintenance_msg"
                        badgeKey="shortlinks.pastead_maintenance_badge"
                        accent="amber"
                        t={t}
                    />
                ) : null}

                {adlinkfly?.enabled ? (
                    <div
                        className={`bg-surface border rounded-[2.5rem] p-10 shadow-xl transition-all duration-500 ${
                            adlinkflyLimitReached ? 'border-gray-800 opacity-80' : 'border-sky-500/20 hover:border-sky-500/40'
                        }`}
                        data-bm-adlinkfly-card="1"
                    >
                        <div className="flex flex-col md:flex-row justify-between gap-8">
                            <div className="space-y-6 flex-1">
                                <div className="flex items-center gap-4">
                                    <div className="p-4 bg-gray-900/50 rounded-2xl border border-gray-800">
                                        <ExternalLink className="w-8 h-8 text-sky-400" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black text-white">{adlinkfly.shortlinkName || 'AdLinkFly Shortlink'}</h3>
                                        <p className="text-sm font-bold text-sky-400 mt-1">
                                            {t('shortlinks.reward')}: {adlinkfly.rewardName || '+20 H/s por 24h'}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1 font-medium">
                                            {t('shortlinks.pastead_cap', {
                                                earned: adlinkfly.dailyHsEarned ?? 0,
                                                cap: adlinkfly.dailyHsCap ?? 1000,
                                            })}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                    <div className="bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.status_label')}</p>
                                        <p
                                            className={`text-sm font-bold ${
                                                adlinkflyLimitReached
                                                    ? 'text-red-400'
                                                    : adlinkflyPending
                                                      ? 'text-sky-400'
                                                      : 'text-emerald-400'
                                            }`}
                                        >
                                            {t(
                                                adlinkflyLimitReached
                                                    ? 'shortlinks.limit_reached'
                                                    : adlinkflyPending
                                                      ? adl.isAutoClaiming
                                                          ? 'shortlinks.pastead_status_validating'
                                                          : 'shortlinks.pastead_status_pending'
                                                      : 'shortlinks.available',
                                            )}
                                        </p>
                                    </div>
                                    <div className="bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.daily_usage')}</p>
                                        <p className="text-sm font-bold text-white">
                                            {adlinkflyRuns} / {adlinkflyMaxRuns}
                                        </p>
                                    </div>
                                    <div className="hidden md:block bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                        <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.difficulty')}</p>
                                        <div className="flex gap-1 mt-1">
                                            <div className="w-3 h-1.5 bg-sky-400 rounded-full" />
                                            <div className="w-3 h-1.5 bg-sky-400 rounded-full" />
                                            <div className="w-3 h-1.5 bg-gray-700 rounded-full" />
                                        </div>
                                    </div>
                                </div>

                                {adlinkflyPending ? (
                                    <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
                                        <p className="text-xs font-medium text-blue-100/90 leading-relaxed">
                                            {t(
                                                adl.isAutoClaiming
                                                    ? adl.claimPhase === 'waiting'
                                                        ? 'shortlinks.pastead_claim_waiting_hint'
                                                        : 'shortlinks.pastead_auto_validating_hint'
                                                    : 'shortlinks.pastead_pending_hint',
                                            )}
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500 font-medium leading-relaxed">{t('shortlinks.adlinkfly_help')}</p>
                                )}
                            </div>

                            <div className="flex flex-col justify-center gap-3 md:w-64">
                                {adlinkflyLimitReached ? (
                                    <div className="p-6 bg-red-500/5 border border-red-500/10 rounded-3xl text-center space-y-2">
                                        <Clock className="w-8 h-8 text-red-400 mx-auto" />
                                        <p className="text-xs font-bold text-gray-400">{t('shortlinks.wait_reset')}</p>
                                    </div>
                                ) : adlinkflyPending ? (
                                    <div className="space-y-3">
                                        {adl.isAutoClaiming ? (
                                            <div className="w-full py-6 bg-sky-500/10 border border-sky-500/30 text-blue-100 rounded-[2rem] font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3">
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                {t(
                                                    adl.claimPhase === 'waiting'
                                                        ? 'shortlinks.pastead_claim_waiting'
                                                        : 'shortlinks.pastead_auto_validating',
                                                )}
                                            </div>
                                        ) : (
                                            <div className="w-full py-5 px-4 bg-gray-900/40 border border-sky-500/20 rounded-[2rem] text-center">
                                                <p className="text-xs font-bold text-blue-100/80 leading-relaxed">
                                                    {t('shortlinks.adlinkfly_waiting_redirect')}
                                                </p>
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => void adl.handleReopen()}
                                            disabled={adl.isStarting || adl.isAutoClaiming}
                                            className="w-full py-3 text-xs font-bold uppercase tracking-widest text-sky-300/60 hover:text-blue-100 transition-colors disabled:opacity-50"
                                        >
                                            {t('shortlinks.adlinkfly_reopen_link')}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => void adl.handleStart()}
                                        disabled={adl.isStarting}
                                        className="w-full py-6 bg-sky-500 hover:bg-sky-400 text-black rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-sky-500/20 active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-60"
                                    >
                                        {adl.isStarting ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                {t('shortlinks.starting')}
                                            </>
                                        ) : (
                                            <>
                                                {t('shortlinks.adlinkfly_start')}
                                                <ExternalLink className="w-5 h-5" />
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ) : showAdlinkflyMaintenance ? (
                    <ExternalShortlinkMaintenanceCard
                        title={adlinkfly?.shortlinkName || 'AdLinkFly Shortlink'}
                        messageKey="shortlinks.adlinkfly_maintenance_msg"
                        badgeKey="shortlinks.adlinkfly_maintenance_badge"
                        accent="sky"
                        t={t}
                        dataAttr="adlinkfly"
                    />
                ) : null}

                <div className={`bg-surface border rounded-[2.5rem] p-10 shadow-xl transition-all duration-500 ${isLimitReached ? 'border-gray-800 opacity-80' : 'border-primary/20 hover:border-primary/40'
                    }`}>
                    <div className="flex flex-col md:flex-row justify-between gap-8">
                        <div className="space-y-6 flex-1">
                            <div className="flex items-center gap-4">
                                <div className="p-4 bg-gray-900/50 rounded-2xl border border-gray-800">
                                    <Zap className="w-8 h-8 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-white">{status?.shortlinkName || 'Internal Shortlink'}</h3>
                                    <p className="text-sm font-bold text-primary mt-1">{t('shortlinks.reward')}: {status?.rewardName || '+5 H/s por 24h'}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.status_label')}</p>
                                    <p className={`text-sm font-bold ${isLimitReached ? 'text-red-400' : 'text-emerald-400'}`}>
                                        {isLimitReached ? t('shortlinks.limit_reached') : inProgress ? t('shortlinks.in_progress') : t('shortlinks.available')}
                                    </p>
                                </div>
                                <div className="bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.daily_usage')}</p>
                                    <p className="text-sm font-bold text-white">{runsToday} / {maxRuns}</p>
                                </div>
                                <div className="hidden md:block bg-gray-800/20 p-4 rounded-2xl border border-gray-800/50">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t('shortlinks.difficulty')}</p>
                                    <div className="flex gap-1 mt-1">
                                        <div className="w-3 h-1.5 bg-primary rounded-full" />
                                        <div className="w-3 h-1.5 bg-primary rounded-full" />
                                        <div className="w-3 h-1.5 bg-gray-700 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col justify-center gap-4 md:w-64">
                            {isLimitReached ? (
                                <div className="p-6 bg-red-500/5 border border-red-500/10 rounded-3xl text-center space-y-2">
                                    <Clock className="w-8 h-8 text-red-400 mx-auto" />
                                    <p className="text-xs font-bold text-gray-400">{t('shortlinks.wait_reset')}</p>
                                </div>
                            ) : (
                                <button onClick={handleStart} disabled={isStarting} className="w-full py-6 bg-primary hover:bg-primary-hover text-white rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl shadow-primary/20 active:scale-[0.98] flex items-center justify-center gap-3">
                                    {isStarting ? t('shortlinks.starting') : (
                                        <>
                                            {inProgress ? t('shortlinks.continue_link') : t('shortlinks.start_link')}
                                            <ArrowRight className="w-5 h-5" />
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800/30 border border-gray-800 rounded-3xl p-8 flex items-start gap-6">
                    <div className="p-4 bg-blue-500/10 rounded-2xl shrink-0">
                        <AlertCircle className="w-8 h-8 text-blue-400" />
                    </div>
                    <div className="space-y-2">
                        <h4 className="text-white font-black text-lg">{t('shortlinks.what_is_shortlink')}</h4>
                        <p className="text-sm text-gray-500 leading-relaxed font-medium">{t('shortlinks.shortlink_msg')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ExternalShortlinkMaintenanceCard({
    title,
    messageKey,
    badgeKey,
    accent,
    t,
    dataAttr,
}: {
    title: string;
    messageKey: string;
    badgeKey: string;
    accent: 'amber' | 'sky';
    t: ReturnType<typeof useTranslation>['t'];
    dataAttr?: 'adlinkfly';
}) {
    const border = accent === 'sky' ? 'border-sky-500/30' : 'border-amber-500/30';
    const iconBg = accent === 'sky' ? 'bg-sky-500/10 border-sky-500/20' : 'bg-amber-500/10 border-amber-500/20';
    const iconColor = accent === 'sky' ? 'text-sky-400' : 'text-amber-400';
    const badgeBorder = accent === 'sky' ? 'border-sky-500/40 bg-sky-500/15 text-sky-300' : 'border-amber-500/40 bg-amber-500/15 text-amber-300';
    const messageColor = accent === 'sky' ? 'text-blue-100/90' : 'text-amber-100/90';

    return (
        <div
            className={`bg-surface border ${border} rounded-[2.5rem] p-10 shadow-xl opacity-95`}
            {...(dataAttr === 'adlinkfly' ? { 'data-bm-adlinkfly-card': '1' } : {})}
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className={`p-4 ${iconBg} rounded-2xl border w-fit`}>
                    <ExternalLink className={`w-8 h-8 ${iconColor}`} />
                </div>
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-2xl font-black text-white">{title}</h3>
                        <span
                            className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${badgeBorder}`}
                        >
                            {t(badgeKey)}
                        </span>
                    </div>
                    <p className={`text-sm font-medium leading-relaxed ${messageColor}`}>{t(messageKey)}</p>
                </div>
            </div>
        </div>
    );
}

function ShortlinkDailyResetBanner({
    dailyReset,
    t,
    onResetElapsed,
}: {
    dailyReset: ShortlinkDailyReset;
    t: ReturnType<typeof useTranslation>['t'];
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
                    {t('shortlinks.daily_reset_title', { date: dailyReset.localDate })}
                </p>
                <p className="mt-1 text-xs font-medium text-gray-400">{t('shortlinks.daily_reset_body')}</p>
            </div>
            <div className="shrink-0 text-right">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{t('shortlinks.daily_reset_next')}</p>
                <p className="text-lg font-black tabular-nums text-emerald-300">{label}</p>
            </div>
        </div>
    );
}
