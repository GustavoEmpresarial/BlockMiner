import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Droplets,
  ExternalLink,
  Gift,
  Info,
  Loader2,
  MousePointerClick,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import { api } from '../../shared/auth/auth.store';
import PowerBoostBanner from '../../shared/components/PowerBoostBanner';
import { useDocumentTitleCountdown } from '../../shared/hooks/useDocumentTitleCountdown';
import { reportApiFailure } from '../../shared/utils/reportApiFailure';

/** Zerads 300×250 — same creative as prod SPA / AdRotator. */
const FAUCET_ZERADS_BANNER_URL = 'https://zerads.com/ad/ad.php?width=300&ref=10776';
const FAUCET_PARTNER_SESSION_KEY = 'bm_faucet_partner_session_v1';

type FaucetReward = {
  hashRate?: number;
  durationHours?: number;
  rewardDurationHours?: number;
  permanent?: boolean;
  name?: string;
  imageUrl?: string;
};

type FaucetStatus = {
  ok?: boolean;
  remainingMs?: number;
  partnerWaitRemainingMs?: number;
  partnerVisitActive?: boolean;
  partnerReady?: boolean;
  canClaim?: boolean;
  reward?: FaucetReward;
  message?: string;
};

function readPartnerSession(): boolean {
  try {
    return sessionStorage.getItem(FAUCET_PARTNER_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markPartnerSession(): void {
  try {
    sessionStorage.setItem(FAUCET_PARTNER_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

function clearPartnerSession(): void {
  try {
    sessionStorage.removeItem(FAUCET_PARTNER_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export default function FaucetPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [remainingMs, setRemainingMs] = useState(0);
  const [partnerWaitMs, setPartnerWaitMs] = useState(0);
  const [partnerStarted, setPartnerStarted] = useState(false);
  const [partnerReady, setPartnerReady] = useState(false);
  const [canClaim, setCanClaim] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [visitStarted, setVisitStarted] = useState(false);
  const fetchGen = useRef(0);
  const cooldownRef = useRef(0);
  const partnerActiveRef = useRef(false);
  const partnerWaitRef = useRef(0);
  const visitStartedRef = useRef(false);
  const skipRemotePartnerApply = useRef(false);

  const applyStatus = useCallback((payload: FaucetStatus) => {
    if ((payload.remainingMs || 0) > 0) {
      clearPartnerSession();
      setVisitStarted(false);
      setPartnerReady(false);
      setCanClaim(false);
      setPartnerStarted(false);
      setPartnerWaitMs(0);
      return;
    }
    const wait = Math.max(0, Number(payload.partnerWaitRemainingMs || 0));
    if (payload.partnerVisitActive && wait > 0) {
      setPartnerStarted(true);
      setPartnerWaitMs(wait);
      setVisitStarted(true);
      setPartnerReady(false);
      setCanClaim(false);
      return;
    }
    if (payload.partnerReady) {
      // Require a visit started in this browser session (matches prod gate).
      if (!readPartnerSession()) {
        setPartnerReady(false);
        setCanClaim(false);
        setPartnerStarted(false);
        setPartnerWaitMs(0);
        setVisitStarted(false);
        return;
      }
      setPartnerStarted(true);
      setPartnerWaitMs(0);
      setVisitStarted(true);
      setPartnerReady(true);
      setCanClaim(!!payload.canClaim);
      return;
    }
    setPartnerReady(false);
    setCanClaim(false);
    setPartnerStarted(false);
    setPartnerWaitMs(0);
  }, []);

  const refresh = useCallback(async () => {
    const gen = ++fetchGen.current;
    try {
      const res = await api.get<FaucetStatus>('/faucet/status');
      if (gen !== fetchGen.current) return;
      if (res.data?.ok) {
        setStatus(res.data);
        setRemainingMs(res.data.remainingMs || 0);
        const onCooldown = (res.data.remainingMs || 0) > 0;
        if (
          !skipRemotePartnerApply.current &&
          !(partnerActiveRef.current || partnerWaitRef.current > 0 || visitStartedRef.current)
        ) {
          applyStatus(res.data);
        } else if (onCooldown) {
          applyStatus(res.data);
        }
      }
    } catch (err) {
      console.error('Faucet status fetch failed', err);
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    cooldownRef.current = remainingMs;
  }, [remainingMs]);
  useEffect(() => {
    partnerActiveRef.current = partnerStarted;
  }, [partnerStarted]);
  useEffect(() => {
    partnerWaitRef.current = partnerWaitMs;
  }, [partnerWaitMs]);
  useEffect(() => {
    visitStartedRef.current = visitStarted;
  }, [visitStarted]);

  useEffect(() => {
    if (remainingMs <= 0) return undefined;
    const id = window.setInterval(() => {
      setRemainingMs((v) => Math.max(0, v - 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [remainingMs > 0]);

  useEffect(() => {
    if (partnerWaitMs <= 0) return undefined;
    const id = window.setInterval(() => {
      setPartnerWaitMs((v) => (v <= 1000 ? 0 : v - 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [partnerWaitMs > 0]);

  useEffect(() => {
    if (partnerWaitMs === 0 && partnerStarted) {
      markPartnerSession();
      setPartnerReady(true);
      setCanClaim(cooldownRef.current <= 0);
    }
  }, [partnerWaitMs, partnerStarted]);

  const idleForPartner =
    !loading && remainingMs === 0 && !partnerReady && !partnerStarted && partnerWaitMs === 0;

  useDocumentTitleCountdown({
    remainingSeconds: Math.ceil(partnerWaitMs / 1000),
    isActive: partnerStarted && partnerWaitMs > 0,
    isComplete: partnerReady,
    pageName: 'Faucet',
  });

  const startPartner = async () => {
    try {
      const res = await api.post<{ ok?: boolean; waitMs?: number }>('/faucet/partner/start');
      if (res.data?.ok) {
        const wait = res.data.waitMs || 10_000;
        partnerActiveRef.current = true;
        partnerWaitRef.current = wait;
        setPartnerStarted(true);
        setPartnerWaitMs(wait);
        toast.info(t('faucet.partner_toast_started'));
      }
    } catch (err) {
      skipRemotePartnerApply.current = false;
      setVisitStarted(false);
      visitStartedRef.current = false;
      toast.error(t('common.error'));
      reportApiFailure({
        operation: 'faucet_partner_start',
        message: err instanceof Error ? err.message : 'partner_start_failed',
        statusCode: isAxiosError(err) ? err.response?.status : undefined,
      });
    }
  };

  const openPartner = () => {
    if (visitStarted || remainingMs > 0 || partnerReady) return;
    fetchGen.current += 1;
    skipRemotePartnerApply.current = true;
    visitStartedRef.current = true;
    setVisitStarted(true);
    window.open(FAUCET_ZERADS_BANNER_URL, '_blank', 'noopener,noreferrer');
    void startPartner();
  };

  useEffect(() => {
    if (!idleForPartner || visitStarted) return undefined;
    const onBlur = () => {
      if (visitStartedRef.current || cooldownRef.current > 0) return;
      fetchGen.current += 1;
      skipRemotePartnerApply.current = true;
      visitStartedRef.current = true;
      setVisitStarted(true);
      void startPartner();
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [idleForPartner, visitStarted]);

  const claim = async () => {
    if (!canClaim || claiming) return;
    setClaiming(true);
    try {
      const res = await api.post<{ ok?: boolean; message?: string }>('/faucet/claim');
      if (res.data?.ok) {
        toast.success(res.data.message || t('common.success'));
        clearPartnerSession();
        setVisitStarted(false);
        setPartnerReady(false);
        setCanClaim(false);
        setPartnerStarted(false);
        skipRemotePartnerApply.current = false;
        await refresh();
      }
    } catch (err) {
      const ax = isAxiosError(err) ? err : null;
      toast.error(ax?.response?.data?.message || t('common.error'));
      reportApiFailure({
        operation: 'faucet_claim',
        message: ax?.response?.data?.message || 'faucet_claim_failed',
        statusCode: ax?.response?.status,
      });
    } finally {
      setClaiming(false);
    }
  };

  const fmt = (ms: number) => {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t('faucet.loading')}</p>
      </div>
    );
  }

  const reward = status?.reward;
  const durationHours = Number(reward?.rewardDurationHours ?? reward?.durationHours ?? 24);
  const durationLabel =
    durationHours >= 168 ? t('faucet.duration_7d') : t('faucet.duration_24h');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="text-center space-y-4">
        <div className="inline-flex p-3 bg-primary/10 rounded-2xl mb-2">
          <Droplets className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight uppercase italic">{t('faucet.title')}</h1>
        <p className="text-gray-500 font-medium max-w-lg mx-auto">{t('faucet.subtitle')}</p>
      </div>

      <PowerBoostBanner />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Prize */}
        <div className="bg-surface border border-gray-800/50 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden group">
          <div className="relative z-10">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mb-8">
              {t('faucet.avail_prize')}
            </h3>
            <div className="flex flex-col items-center text-center space-y-8">
              <div className="w-48 h-48 bg-gradient-to-br from-sky-500/15 via-primary/10 to-transparent rounded-3xl p-6 border border-primary/25 group-hover:border-primary/45 transition-all duration-500 group-hover:scale-105 shadow-inner flex items-center justify-center">
                <Zap className="w-24 h-24 text-primary drop-shadow-[0_0_18px_rgba(56,189,248,0.35)]" aria-hidden />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white mb-2 uppercase italic tracking-tighter">
                  {t('faucet.reward_power_title')}
                </h2>
                <div className="flex flex-col items-center gap-2">
                  <p className="text-lg font-black text-primary tabular-nums">
                    {t('faucet.reward_power_subtitle', {
                      hashRate: reward?.hashRate ?? '—',
                    })}
                  </p>
                  <div className="flex items-center justify-center gap-1.5 text-sky-300 text-xs font-semibold tracking-wide">
                    <Clock3 className="w-3.5 h-3.5 shrink-0 opacity-80" aria-hidden />
                    <span>
                      {reward?.permanent
                        ? t('faucet.reward_permanent')
                        : t('faucet.reward_temporary', { duration: durationLabel })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-[100px] -z-0" />
        </div>

        {/* Partner + claim */}
        <div className="space-y-6">
          <div className="bg-surface border border-gray-800/50 rounded-[3rem] p-8 md:p-10 shadow-xl relative overflow-hidden">
            {remainingMs > 0 ? (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-24 h-24 rounded-full border-4 border-gray-800 border-t-primary animate-spin flex items-center justify-center">
                    <Clock3 className="w-10 h-10 text-primary -rotate-45" />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">
                    {t('faucet.wait_cooldown')}
                  </p>
                  <h3 className="text-4xl font-black text-white italic">{fmt(remainingMs)}</h3>
                </div>
                <div className="p-5 bg-gray-900/50 rounded-2xl border border-gray-800 flex items-start gap-4 text-left shadow-inner">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-500 font-medium leading-relaxed">{t('faucet.cooldown_msg')}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <div
                  className={`p-6 sm:p-8 rounded-[2.5rem] border transition-all duration-500 relative overflow-hidden ${
                    partnerReady
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : 'bg-primary/5 border-primary/20 shadow-inner'
                  }`}
                >
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      {partnerReady ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <MousePointerClick className="w-5 h-5 text-primary" />
                      )}
                      <span className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                        {t('faucet.step_partner')}
                      </span>
                    </div>
                    {partnerReady ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 animate-in zoom-in duration-300" />
                    ) : null}
                  </div>

                  <p className="text-xs text-gray-500 font-medium mb-8 leading-relaxed">
                    {t('faucet.partner_msg')}
                  </p>

                  {partnerWaitMs > 0 ? (
                    <div className="flex items-center justify-center gap-4 py-6 bg-gray-900 rounded-2xl border border-gray-800 shadow-xl">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      <span className="text-lg font-black text-white italic uppercase tracking-tighter">
                        {t('faucet.wait_seconds', { seconds: Math.ceil(partnerWaitMs / 1000) })}
                      </span>
                    </div>
                  ) : partnerReady ? (
                    <div className="flex items-center justify-center gap-4 py-6 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      <span className="text-lg font-black text-emerald-500 uppercase italic tracking-tighter">
                        {t('faucet.unlocked')}
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="w-full max-w-[300px] mx-auto space-y-3">
                        <div className="relative rounded-2xl overflow-hidden border border-gray-700 bg-gray-900 min-h-[250px]">
                          <iframe
                            src={FAUCET_ZERADS_BANNER_URL}
                            width={300}
                            height={250}
                            title={t('faucet.partner_iframe_title')}
                            className="block w-full max-w-full border-0"
                            scrolling="no"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={openPartner}
                          disabled={visitStarted}
                          className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary text-white shadow-lg hover:brightness-110 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          {t('faucet.partner_open_btn')}
                        </button>
                      </div>
                      <div className="flex items-center justify-center gap-2 text-primary/60">
                        <MousePointerClick className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-widest">
                          {t('faucet.partner_click_hint')}
                        </span>
                      </div>
                      <div className="flex items-center justify-center gap-2 text-primary/40">
                        <ExternalLink className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-widest">
                          {t('faucet.partner_new_tab_hint')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void claim()}
                  disabled={!canClaim || claiming}
                  className={`w-full py-6 rounded-[2.5rem] font-black text-sm uppercase tracking-[0.2em] transition-all shadow-xl active:scale-[0.98] flex items-center justify-center gap-4 italic ${
                    canClaim
                      ? 'bg-primary text-white shadow-primary/20 hover:scale-[1.02] hover:shadow-primary/40'
                      : 'bg-gray-800 text-gray-600 cursor-not-allowed border border-gray-700/50'
                  }`}
                >
                  {claiming ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <Gift className={`w-6 h-6 ${canClaim ? 'animate-bounce' : ''}`} />
                      {t('faucet.claim_miner')}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="bg-blue-500/5 border border-blue-500/10 rounded-[2rem] p-8 flex gap-5 shadow-xl">
            <div className="p-3 bg-blue-500/10 rounded-xl h-fit">
              <Info className="w-6 h-6 text-blue-400 shrink-0" />
            </div>
            <div className="space-y-2">
              <h4 className="text-white text-xs font-black uppercase tracking-widest italic">
                {t('shop.how_it_works_title', { defaultValue: 'Como funciona' })}
              </h4>
              <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
                {t('faucet.how_it_works_msg')}
              </p>
              <p className="text-[11px] text-sky-300/90 font-medium leading-relaxed border-t border-blue-500/15 pt-3 mt-1">
                {t('faucet.permanent_equipment_note', { duration: durationLabel })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
