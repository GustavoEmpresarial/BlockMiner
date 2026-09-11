import { useState, useEffect, useCallback, useRef } from 'react';
import type { MouseEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowRight, ShieldCheck, Zap, Loader2, AlertTriangle } from 'lucide-react';
import { isAxiosError } from 'axios';
import { api } from '../../shared/auth/auth.store';
import AdBanner from '../../shared/components/AdBanner';
import MondiadBanner from '../../shared/components/MondiadBanner';
import { reportApiFailure } from '../../shared/utils/reportApiFailure';
import { useResumableCountdown } from '../../shared/hooks/useResumableCountdown';
import PausedTimerBanner from '../../shared/components/PausedTimerBanner';
import { usePowerBoostActive } from '../../shared/hooks/usePowerBoostActive';
import { t } from './lib/shortlinks.i18n';
import { useShortlinkPageLease, SL_PAUSED_KEY } from './lib/shortlinkBackground';

const STEP_DURATION_SEC = 10;
/** How long focus must stay away before counting as "the user left". */
const BLUR_PAUSE_GRACE_MS = 8000;

interface ShortlinkSessionStored {
  token: string;
  currentStep: number;
}

interface CompleteStepResponse {
  ok?: boolean;
  runCompleted?: boolean;
  reward?: { message?: string };
  sessionToken?: string;
}

/** A reload starts the page over — nothing is counting, so coming back
 *  to a "you left the page" banner makes no sense. Only a real reload clears it; returning from
 *  another route must keep the pause. */
function readPausedFlag(key: string): boolean {
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

export default function ShortlinkStepPage() {
    // Claim the page lease: while this component is mounted it owns the `sl_step_N_timer`
    // record via useResumableCountdown, and ShortlinkBackgroundRunner must not debit it too.
    useShortlinkPageLease();
    const powerBoostActive = usePowerBoostActive();
    const navigate = useNavigate();
    const { step } = useParams();

    const currentStepNum = Number(step) || 1;
    const [isProcessing, setIsProcessing] = useState(false);

    // Retrieve session from storage to allow page refreshes
    const getStoredSession = (): ShortlinkSessionStored | null => {
        const stored = sessionStorage.getItem('sl_session');
        if (!stored) return null;
        try {
            const parsed: unknown = JSON.parse(stored);
            if (
                typeof parsed === 'object' &&
                parsed !== null &&
                'token' in parsed &&
                typeof (parsed as { token: unknown }).token === 'string' &&
                'currentStep' in parsed &&
                typeof (parsed as { currentStep: unknown }).currentStep === 'number'
            ) {
                return parsed as ShortlinkSessionStored;
            }
        } catch {
            /* ignore */
        }
        return null;
    };

    const session = getStoredSession();
    const hasSession = !!session?.token && session.currentStep === currentStepNum;

    const [isPaused, setIsPaused] = useState<boolean>(() => readPausedFlag(SL_PAUSED_KEY));

    /** True only while the step timer is really counting — read by listeners and by the unmount
     *  cleanup, which would otherwise close over a stale value. */
    const wasCountingRef = useRef(false);

    const pauseCounting = useCallback(() => {
        // Never pause someone who was not counting: marking a pause on arrival (or after the
        // timer already finished) would show a "you left the page" banner they never earned.
        if (!wasCountingRef.current) return;
        try {
            sessionStorage.setItem(SL_PAUSED_KEY, '1');
        } catch { /* ignore */ }
        setIsPaused(true);
    }, []);

    const handleResumeCounting = useCallback(() => {
        try {
            sessionStorage.removeItem(SL_PAUSED_KEY);
        } catch { /* ignore */ }
        setIsPaused(false);
    }, []);

    const countdown = useResumableCountdown({
        storageKey: `sl_step_${currentStepNum}_timer`,
        totalSeconds: STEP_DURATION_SEC,
        running: hasSession,
        paused: isPaused,
        signature: session?.token ?? null,
        // Steps 1→2→3 reuse this component instance, so the countdown must restart per step.
        cycleId: currentStepNum,
    });

    useEffect(() => {
        // Validation: Must have a token and must be on the correct step URL.
        //
        // Deliberately keyed on the step only. `session` is re-read from sessionStorage on every
        // render, so listing its fields here makes this effect fire mid-transition: after a
        // successful step the handler writes {currentStep: n+1} and navigates, then `finally`
        // sets isProcessing(false), which re-renders THIS still-mounted instance — where
        // `currentStepNum` is still n while the stored step is already n+1. The effect then
        // reads a mismatch that does not exist, toasts "wrong sequence" and throws the user back
        // to /shortlinks. That made every run fail right after step 1.
        if (!session?.token || session.currentStep !== currentStepNum) {
            if (!session?.token) toast.error(t('shortlinks.step_no_session'));
            else toast.error(t('shortlinks.step_sequence_error'));
            navigate('/shortlinks');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentStepNum, navigate]);

    // Derived from the countdown alone, and from nothing else.
    //
    // It previously also required `hasSession && !isProcessing`. That looked harmless but it
    // un-latched the button: the old implementation stored canProceed in state, so once the
    // countdown finished the button stayed enabled forever. Re-deriving it every render meant a
    // single render where `hasSession` or `expired` read false — a sessionStorage read racing the
    // write on step transition — permanently disabled it. Completion went from ~54% to 0%.
    //
    // `isProcessing` is still honoured by the button's own `disabled`, and `handleNext` guards on
    // the session token, so nothing is lost by keeping this condition narrow.
    const canProceed = countdown.expired;

    useEffect(() => {
        // The timer finished but the session vanished from storage — the user is looking at an
        // enabled button that can never work. Invisible server-side: no request is ever made.
        //
        // Two guards learned from the first version, which reported constantly on healthy runs:
        // a stored step AHEAD of this one is the normal 1→2→3 transition (this instance re-renders
        // before unmounting), and even a null session needs a moment, because the handler clears
        // storage before navigating away on the final claim.
        const storedStep = session?.currentStep ?? null;
        if (!canProceed || hasSession) return undefined;
        if (storedStep != null && storedStep > currentStepNum) return undefined;
        const id = setTimeout(() => {
            const stillStored = sessionStorage.getItem('sl_session');
            if (stillStored) return;
            reportApiFailure({
                operation: 'shortlink_step_orphaned',
                message: 'step timer finished with no matching session in storage',
                context: { step: currentStepNum, storedStep },
            });
        }, 4000);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canProceed, hasSession, currentStepNum]);

    // Deliberately NOT part of `canProceed`: once the countdown finishes the button stays
    // enabled, pause or not. Pausing only ever stops the clock, never the latch.
    wasCountingRef.current = hasSession && !isPaused && !canProceed;

    useEffect(() => {
        // `visibilitychange` covers tab switch and minimise. It does NOT fire when the user
        // alt-tabs to another application with the browser window still on screen, so `blur`
        // is needed as well.
        // A reload is not the user leaving: Chrome fires visibilitychange → hidden while tearing
        // the document down, which would make every F5 come back already paused.
        let unloading = false;
        const markUnloading = () => { unloading = true; };
        const pause = () => { if (!unloading) pauseCounting(); };

        // Power Boost: blur, tab switch, other apps, and SPA navigation must NOT freeze the
        // step timer. ShortlinkBackgroundRunner (mounted in ProtectedLayout) keeps ticking the
        // sessionStorage countdown while the user is on another BlockMiner page.
        const onHidden = () => {
            if (powerBoostActive) return;
            if (document.hidden) pause();
        };
        // Blur alone is far too trigger-happy: ad scripts create iframes and steal focus, so
        // counting was being frozen seconds after it started. `document.hasFocus()` stays true
        // while focus is merely inside one of our own iframes, and the grace delay ignores
        // focus that bounces straight back.
        let blurTimer: ReturnType<typeof setTimeout> | undefined;
        const onFocus = () => { if (blurTimer) { clearTimeout(blurTimer); blurTimer = undefined; } };
        const onBlur = () => {
            if (powerBoostActive) return;
            if (blurTimer) clearTimeout(blurTimer);
            blurTimer = setTimeout(() => {
                blurTimer = undefined;
                if (!document.hasFocus()) pause();
            }, BLUR_PAUSE_GRACE_MS);
        };
        window.addEventListener('beforeunload', markUnloading);
        window.addEventListener('pagehide', markUnloading);
        document.addEventListener('visibilitychange', onHidden);
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);
        return () => {
            if (blurTimer) clearTimeout(blurTimer);
            window.removeEventListener('beforeunload', markUnloading);
            window.removeEventListener('pagehide', markUnloading);
            document.removeEventListener('visibilitychange', onHidden);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
            // Without Power Boost, leaving the step freezes the timer (resume button on return).
            // With Power Boost, keep counting via ShortlinkBackgroundRunner.
            if (!powerBoostActive) pause();
        };
    }, [pauseCounting, powerBoostActive]);

    const handleNext = async (e: MouseEvent<HTMLButtonElement>) => {
        if (!canProceed || isProcessing) return;
        if (!session?.token) return;

        const securityFlags = {
            isUntrustedEvent: !e.isTrusted,
            isAutomated: navigator.webdriver
        };

        try {
            setIsProcessing(true);
            const res = await api.post<CompleteStepResponse>('/shortlink/complete-step', { 
                step: currentStepNum,
                sessionToken: session.token,
                securityFlags
            });
            
            if (res.data.ok) {
                if (res.data.runCompleted) {
                    sessionStorage.removeItem('sl_session');
                    toast.success(res.data.reward?.message || t('shortlinks.step_reward_default'));
                    navigate('/shortlinks');
                } else {
                    const nextStep = currentStepNum + 1;
                    const nextSession = {
                        token: res.data.sessionToken,
                        currentStep: nextStep
                    };
                    sessionStorage.setItem('sl_session', JSON.stringify(nextSession));
                    // Navigate to the NEW URL for the next step
                    navigate(`/shortlink/internal-shortlink/step/${nextStep}`);
                }
            }
        } catch (err: unknown) {
            const msg =
                isAxiosError(err) && err.response?.data && typeof err.response.data === 'object' && err.response.data !== null && 'message' in err.response.data && typeof (err.response.data as { message?: unknown }).message === 'string'
                    ? (err.response.data as { message: string }).message
                    : t('common.error');
            toast.error(msg);
            reportApiFailure({
                operation: 'shortlink_complete_step',
                message: typeof msg === 'string' && msg !== t('common.error') ? msg : 'complete_step_failed',
                statusCode: isAxiosError(err) ? err.response?.status : undefined,
                code: isAxiosError(err) ? (err.response?.data as { code?: string } | null)?.code : undefined,
            }, err);
            if (
                isAxiosError(err) &&
                (Boolean((err.response?.data as { kick?: boolean } | undefined)?.kick) || err.response?.status === 403)
            ) {
                sessionStorage.removeItem('sl_session');
                navigate('/shortlinks');
            }
        } finally {
            setIsProcessing(false);
        }
    };

    if (!session) return null;

    const timeLeft = Math.ceil(countdown.remaining);

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 space-y-8">
            <div className="w-full max-w-2xl flex justify-center">
                <AdBanner size="728x90" />
            </div>

            <div className="w-full ">
                <MondiadBanner
                    bannerId="5674e300-8e33-44ee-ba4c-1f67f2934df2"
                    className="w-full min-h-[250px] flex items-center justify-center"
                />
            </div>

            <div className="w-full max-w-md bg-surface border border-gray-800 rounded-[2.5rem] p-10 shadow-2xl space-y-8 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1.5 bg-gray-800">
                    <div 
                        className="h-full bg-primary transition-all duration-1000 ease-linear" 
                        style={{ width: `${((currentStepNum - 1) / 3) * 100 + ((STEP_DURATION_SEC - timeLeft) / STEP_DURATION_SEC) * (100/3)}%` }}
                    />
                </div>

                <div className="space-y-4">
                    <div className="inline-flex p-4 bg-primary/10 rounded-2xl">
                        <Zap className="w-8 h-8 text-primary" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                            {t('shortlinks.step_title', { step: currentStepNum, total: 3 })}
                        </h2>
                        <p className="text-gray-500 font-medium mt-1 uppercase text-[10px] tracking-widest">
                            {t('shortlinks.step_subtitle')}
                        </p>
                    </div>
                </div>

                <div className="py-6 flex flex-col items-center justify-center">
                    {!canProceed ? (
                        <div className="flex flex-col items-center">
                            <div className="relative w-24 h-24 flex items-center justify-center">
                                <div
                                    className={`absolute inset-0 rounded-full border-4 border-gray-800 ${
                                        isPaused ? 'border-t-amber-500' : 'border-t-primary animate-spin'
                                    }`}
                                />
                                <span className="text-3xl font-black text-white">{timeLeft}</span>
                            </div>
                            {isPaused ? (
                                <div className="mt-6 flex flex-col items-center gap-3">
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-[0.2em] text-center">
                                        {t('shortlinks.paused_hint')}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleResumeCounting}
                                        className="px-6 py-3 rounded-2xl bg-amber-500 text-black font-black text-[11px] uppercase tracking-widest hover:bg-amber-400 active:scale-[0.98] transition-all"
                                    >
                                        {t('shortlinks.resume_button')}
                                    </button>
                                </div>
                            ) : (
                                <p className="mt-6 text-[10px] font-black text-primary animate-pulse uppercase tracking-[0.2em]">
                                    {t('shortlinks.step_syncing')}
                                </p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in zoom-in duration-500">
                            <div className="w-24 h-24 mx-auto rounded-full bg-emerald-500/10 border-4 border-emerald-500/20 flex items-center justify-center">
                                <ShieldCheck className="w-12 h-12 text-emerald-500" />
                            </div>
                            <p className="text-xs font-bold text-emerald-500 uppercase tracking-widest">
                                {t('shortlinks.step_verified')}
                            </p>
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <button
                        onClick={handleNext}
                        disabled={!canProceed || isProcessing}
                        className={`w-full py-6 rounded-[2rem] font-black text-sm uppercase tracking-widest transition-all shadow-xl flex items-center justify-center gap-3 ${
                            canProceed && !isProcessing
                                ? 'bg-primary text-white shadow-primary/20 hover:bg-primary-hover active:scale-[0.98]'
                                : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                        }`}
                    >
                        {isProcessing ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                {currentStepNum === 3 ? t('shortlinks.step_claim_final') : t('shortlinks.step_continue')}
                                <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>

                    <div className="flex items-center justify-center gap-2 text-slate-600">
                        <AlertTriangle className="w-3 h-3" />
                        <span className="text-[9px] font-bold uppercase tracking-tighter tracking-widest">
                            {t('shortlinks.step_no_refresh')}
                        </span>
                    </div>

                    <PausedTimerBanner
                        show={countdown.wasPaused}
                        onDismiss={countdown.dismissPaused}
                        context="shortlink"
                    />
                </div>
            </div>

            <div className="w-full max-w-2xl flex justify-center">
                <AdBanner size="300x250" />
            </div>
        </div>
    );
}
