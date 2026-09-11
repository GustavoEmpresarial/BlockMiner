import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { Activity, Check, Copy, Gift, Users, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '../../shared/auth/auth.store';
import { useGameStore, type MiningStatsSnapshot } from '../shell/lib/game.store';
import { formatHashrate, apiErrorMessage } from '../machines/lib/machines.shared';
import {
  getMiningCycle,
  getWalletBalance,
  getRoomsSlotsSummary,
  getWithdrawFeeInfo,
  patchMiningAllocation,
  postLinkReferral,
} from './lib/dashboard.api';
import type { DashboardBlockRow, DashboardCycleState } from './lib/dashboard.types';
import {
  DASHBOARD_POL_BALANCE_DECIMALS,
  DASHBOARD_REFERRAL_CODE_MAX_LEN,
  DASHBOARD_REST_POLL_MS,
} from './lib/dashboard.config';
import {
  buildReferralRegisterUrl,
  displayDashboardUserName,
  mapWalletBalancePayload,
  nextBlockCountdownAnchor,
  pendingPolAccrual,
  sanitizeReferralInput,
  smoothedBlockCountdownSeconds,
  type BlockCountdownAnchor,
} from './lib/dashboard.helpers';
import {
  readDashboardBalanceCurrency,
  writeDashboardBalanceCurrency,
  emptyDashboardWalletBalances,
  type DashboardBalanceCurrency,
  type DashboardWalletBalances,
} from './lib/dashboardBalanceCurrency';
import {
  DashboardActivityCard,
  DashboardCards,
  DashboardEfficiencyCard,
  DashboardHistory,
} from './components/dashboard.parts';
import { MiningAllocationPanel } from './components/MiningAllocationPanel';
import DashboardBannersCarousel from './components/DashboardBannersCarousel';
import DashboardEnergyTaxModal from './components/DashboardEnergyTaxModal';

function mergeCycleWithSocket(
  rest: DashboardCycleState | null,
  socket: MiningStatsSnapshot | null | undefined,
): DashboardCycleState | null {
  if (!rest && !socket) return null;
  const base = { ...(rest ?? {}), ...(socket ?? {}) } as DashboardCycleState;
  if (socket?.miner) base.miner = socket.miner as DashboardCycleState['miner'];
  else if (rest?.miner) base.miner = rest.miner;
  const socketHistory = socket?.blockHistory;
  const restHistory = rest?.blockHistory;
  if (Array.isArray(socketHistory) && socketHistory.length > 0) {
    base.blockHistory = socketHistory as DashboardBlockRow[];
  } else if (Array.isArray(restHistory)) {
    base.blockHistory = restHistory as DashboardBlockRow[];
  }
  if (rest?.blockCountdownSeconds != null) base.blockCountdownSeconds = rest.blockCountdownSeconds;
  return base;
}

function splitHashrateLabel(formatted: string): [string, string] {
  const parts = formatted.trim().split(/\s+/);
  if (parts.length < 2) return [formatted, 'H/s'];
  const unit = parts.pop() ?? 'H/s';
  return [parts.join(' '), unit];
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const checkSession = useAuthStore((s) => s.checkSession);
  const initSocket = useGameStore((s) => s.initSocket);
  const socketStats = useGameStore((s) => s.stats);

  const [referralCopied, setReferralCopied] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [linkingReferral, setLinkingReferral] = useState(false);
  const [blkBalance, setBlkBalance] = useState<number | null>(null);
  const [walletBalances, setWalletBalances] = useState<DashboardWalletBalances>(() =>
    emptyDashboardWalletBalances(),
  );
  const [balanceCurrency, setBalanceCurrency] = useState<DashboardBalanceCurrency>(() =>
    readDashboardBalanceCurrency(user?.id),
  );
  const [cycleRest, setCycleRest] = useState<DashboardCycleState | null>(null);
  const [pendingAllocPercent, setPendingAllocPercent] = useState<number | null>(null);
  const [savingAlloc, setSavingAlloc] = useState(false);
  const [allocModalOpen, setAllocModalOpen] = useState(false);
  const [draftPol, setDraftPol] = useState('100');
  const [draftShib, setDraftShib] = useState('0');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [freeRacks, setFreeRacks] = useState<number | null>(null);
  const [inventoryCount, setInventoryCount] = useState<number | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [completionsToday, setCompletionsToday] = useState<number | null>(null);
  const [requiredForWaiver, setRequiredForWaiver] = useState<number | null>(null);
  const [feeWaived, setFeeWaived] = useState(false);
  const [feeAlreadyChargedToday, setFeeAlreadyChargedToday] = useState(false);
  const [feeInfoLoading, setFeeInfoLoading] = useState(true);
  const [liveClockMs, setLiveClockMs] = useState(() => Date.now());

  const blockAnchorRef = useRef<BlockCountdownAnchor | null>(null);

  const cycle = useMemo(
    () => mergeCycleWithSocket(cycleRest, socketStats),
    [cycleRest, socketStats],
  );

  useEffect(() => {
    initSocket();
  }, [initSocket]);

  useEffect(() => {
    setBalanceCurrency(readDashboardBalanceCurrency(user?.id));
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    getRoomsSlotsSummary()
      .then((res) => {
        if (cancelled || !res?.ok) return;
        setFreeRacks(Number(res.freeRacks ?? 0));
        setInventoryCount(Number(res.inventoryCount ?? 0));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    getWithdrawFeeInfo()
      .then((res) => {
        if (cancelled || !res?.ok) return;
        setCompletionsToday(Number(res.completionsToday ?? 0));
        setRequiredForWaiver(Number(res.requiredForWaiver ?? 10));
        setFeeWaived(Boolean(res.feeWaived));
        setFeeAlreadyChargedToday(Boolean(res.feeAlreadyChargedToday));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFeeInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchCycle = async () => {
      try {
        const data = await getMiningCycle();
        if (cancelled || !data?.ok) return;
        setCycleRest(data);
        const nowMs = Date.now();
        blockAnchorRef.current = nextBlockCountdownAnchor(data, blockAnchorRef.current, nowMs);
      } catch {
        /* ignore */
      }
    };
    void fetchCycle();
    const intervalId = window.setInterval(() => void fetchCycle(), DASHBOARD_REST_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void fetchCycle();
    };
    const onFocus = () => void fetchCycle();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchBalance = async () => {
      try {
        const data = await getWalletBalance();
        if (cancelled || data?.ok === false) return;
        const mapped = mapWalletBalancePayload(data);
        setWalletBalances(mapped);
        setBlkBalance(mapped.BLK);
      } catch {
        /* ignore */
      }
    };
    void fetchBalance();
    const intervalId = window.setInterval(() => void fetchBalance(), DASHBOARD_REST_POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void fetchBalance();
    };
    const onFocus = () => void fetchBalance();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setLiveClockMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const miner = cycle?.miner ?? undefined;
  const blockHistory = Array.isArray(cycle?.blockHistory) ? cycle.blockHistory : [];
  const polBps = Math.max(0, Math.min(10_000, Math.round(Number(miner?.miningAllocationPolBps ?? 10_000))));
  const serverPolPercent = Math.round(polBps / 100);
  const effectivePolPercent = pendingAllocPercent ?? serverPolPercent;
  const effectiveShibPercent = 100 - effectivePolPercent;
  const blockRewardPol = Number(cycle?.blockReward ?? 0);
  const blockRewardShib = Number(cycle?.blockRewardShib ?? 0);

  useEffect(() => {
    if (pendingAllocPercent == null || pendingAllocPercent === serverPolPercent) return;
    const timer = window.setTimeout(async () => {
      try {
        setSavingAlloc(true);
        const polBpsPayload = Math.round(pendingAllocPercent * 100);
        const res = await patchMiningAllocation(polBpsPayload);
        if (res?.ok) {
          toast.success(t('dashboard.allocation_updated'));
          setCycleRest((prev) =>
            prev?.miner
              ? {
                  ...prev,
                  miner: {
                    ...prev.miner,
                    miningAllocationPolBps: Number(res.polBps ?? polBpsPayload),
                  },
                }
              : prev,
          );
          setPendingAllocPercent(null);
        } else {
          toast.error(res?.message || t('common.error'));
          setPendingAllocPercent(null);
        }
      } catch (err: unknown) {
        toast.error(apiErrorMessage(err, t('common.error')));
        setPendingAllocPercent(null);
      } finally {
        setSavingAlloc(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [pendingAllocPercent, serverPolPercent, t]);

  const referralUrl =
    user?.id != null ? buildReferralRegisterUrl(user.id, user.refCode ?? null) : '';

  const [speedVal, speedUnit] = splitHashrateLabel(
    miner ? formatHashrate(miner.estimatedHashRate) : '0 H/s',
  );
  const [netVal, netUnit] = splitHashrateLabel(
    cycle?.networkHashRate ? formatHashrate(cycle.networkHashRate) : '0 H/s',
  );

  const anchor = blockAnchorRef.current;
  const blockDurationSeconds =
    anchor?.durationSeconds ?? Math.max(1, Number(cycle?.blockIntervalMinutes ?? 10) * 60);
  const countdownSeconds = smoothedBlockCountdownSeconds(anchor, liveClockMs);
  const pendingPol = pendingPolAccrual({
    networkHashRate: Number(cycle?.networkHashRate ?? 0),
    userHashRate: Number(miner?.estimatedHashRate ?? 0),
    blockRewardPol,
    countdownSeconds,
    blockDurationSeconds,
  });

  const onBalanceCurrencyChange = (currency: DashboardBalanceCurrency) => {
    setBalanceCurrency(currency);
    writeDashboardBalanceCurrency(user?.id, currency);
  };

  const copyReferral = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setReferralCopied(true);
      toast.success(t('dashboard.referral_copied'));
      window.setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      toast.error(t('dashboard.referral_copy_failed'));
    }
  };

  const linkFriendReferral = async () => {
    const code = sanitizeReferralInput(friendCode);
    if (!code || linkingReferral) return;
    setLinkingReferral(true);
    try {
      const res = await postLinkReferral(code);
      if (res.ok) {
        toast.success(res.message || t('dashboard.referral_linked'));
        setFriendCode('');
        await checkSession({ silent: true });
      }
    } catch (err: unknown) {
      const message = isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message
        : undefined;
      toast.error(message || t('dashboard.referral_link_error'));
    } finally {
      setLinkingReferral(false);
    }
  };

  const displayName = displayDashboardUserName(user?.name);

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight mb-3">
            {t('dashboard.welcome', { name: displayName })}
          </h1>
          <p className="text-gray-500 font-medium max-w-xl text-sm md:text-base leading-relaxed">
            {t('dashboard.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2.5 px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <Wifi className="w-4 h-4 text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
            {t('dashboard.synced')}
          </span>
        </div>
      </div>

      <DashboardEnergyTaxModal />
      <DashboardBannersCarousel />

      <MiningAllocationPanel
        effectivePolPercent={effectivePolPercent}
        effectiveShibPercent={effectiveShibPercent}
        blockRewardPol={blockRewardPol}
        blockRewardShib={blockRewardShib}
        savingAlloc={savingAlloc}
        allocModalOpen={allocModalOpen}
        draftPol={draftPol}
        draftShib={draftShib}
        draftError={draftError}
        onOpenModal={() => {
          setDraftPol(String(effectivePolPercent));
          setDraftShib(String(effectiveShibPercent));
          setDraftError(null);
          setAllocModalOpen(true);
        }}
        onCloseModal={() => {
          if (!savingAlloc) setAllocModalOpen(false);
        }}
        onDraftPolChange={(raw) => {
          if (raw === '') {
            setDraftPol('');
            setDraftError(null);
            return;
          }
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          const clamped = Math.max(0, Math.min(100, Math.round(n)));
          setDraftPol(String(clamped));
          setDraftShib(String(100 - clamped));
          setDraftError(null);
        }}
        onDraftShibChange={(raw) => {
          if (raw === '') {
            setDraftShib('');
            setDraftError(null);
            return;
          }
          const n = Number(raw);
          if (!Number.isFinite(n)) return;
          const clamped = Math.max(0, Math.min(100, Math.round(n)));
          setDraftShib(String(clamped));
          setDraftPol(String(100 - clamped));
          setDraftError(null);
        }}
        onPreset={(pol) => {
          setDraftPol(String(pol));
          setDraftShib(String(100 - pol));
          setDraftError(null);
        }}
        onSave={() => {
          const polN = Number(draftPol);
          const shibN = Number(draftShib);
          if (!Number.isFinite(polN) || !Number.isFinite(shibN)) {
            setDraftError(t('dashboard.mining_allocation_modal_error_invalid'));
            return;
          }
          if (polN < 0 || polN > 100 || shibN < 0 || shibN > 100) {
            setDraftError(t('dashboard.mining_allocation_modal_error_range'));
            return;
          }
          if (polN + shibN !== 100) {
            setDraftError(t('dashboard.mining_allocation_modal_error_sum'));
            return;
          }
          const snapped = Math.round(polN / 5) * 5;
          setPendingAllocPercent(snapped);
          setAllocModalOpen(false);
        }}
      />

      <DashboardCards
        miner={miner}
        cycle={cycle}
        blkBalance={blkBalance}
        walletBalances={walletBalances}
        balanceCurrency={balanceCurrency}
        onBalanceCurrencyChange={onBalanceCurrencyChange}
        speedVal={speedVal}
        speedUnit={speedUnit}
        netVal={netVal}
        netUnit={netUnit}
        pendingPol={pendingPol}
        countdownSeconds={Math.ceil(countdownSeconds)}
        balanceDecimals={DASHBOARD_POL_BALANCE_DECIMALS}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-8">
          <DashboardHistory blockHistory={blockHistory} tokenSymbol={cycle?.tokenSymbol} />
          <div className="bg-surface border border-gray-800/50 rounded-[2rem] p-6 md:p-8 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
              <Users className="w-32 h-32 text-primary -rotate-12" />
            </div>
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-8">
              <div className="space-y-4 max-w-md">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-2xl">
                    <Activity className="w-6 h-6 text-primary" />
                  </div>
                  <h2 className="text-xl md:text-2xl font-black text-white italic uppercase tracking-tighter">
                    {t('dashboard.affiliate_title')}
                  </h2>
                </div>
                <p className="text-sm text-gray-500 font-medium leading-relaxed">
                  {t('dashboard.affiliate_description')}
                </p>
                <div className="flex items-center gap-6 pt-1">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">
                      {t('dashboard.affiliate_active_referrals')}
                    </span>
                    <span className="text-2xl font-black text-white">{miner?.referralCount ?? 0}</span>
                  </div>
                  <div className="w-px h-10 bg-gray-800" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1">
                      {t('dashboard.affiliate_bonus_label')}
                    </span>
                    <span className="text-2xl font-black text-emerald-400">
                      {t('dashboard.affiliate_bonus_rate')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex-1 max-w-sm space-y-4 w-full">
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-2">
                    {t('dashboard.referral_link_label')}
                  </span>
                  {user?.id != null ? (
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-[10px] text-gray-600 uppercase tracking-widest">
                        {t('dashboard.referral_code_label')}
                      </span>
                      <span className="text-xs font-black text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-lg tracking-widest select-all">
                        {String(user.id)}
                      </span>
                    </div>
                  ) : null}
                  <div className="relative flex items-center bg-gray-950 border border-gray-800 rounded-2xl p-1.5 focus-within:border-primary/50 transition-all shadow-inner">
                    <input
                      type="text"
                      readOnly
                      value={referralUrl || '—'}
                      className="bg-transparent border-none text-xs font-bold text-gray-400 px-4 w-full focus:outline-none"
                      aria-label={t('dashboard.referral_link_aria')}
                    />
                    <button
                      type="button"
                      onClick={() => void copyReferral()}
                      disabled={!referralUrl}
                      className="bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {referralCopied ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2 pt-3 border-t border-gray-800/60">
                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest ml-2">
                    {t('dashboard.have_friend_code')}
                  </span>
                  <div className="relative flex items-center bg-gray-950 border border-gray-800 rounded-2xl p-1.5 focus-within:border-amber-500/50 transition-all shadow-inner">
                    <Gift className="w-4 h-4 text-gray-600 ml-3 shrink-0" aria-hidden />
                    <input
                      type="text"
                      placeholder={t('dashboard.paste_code_placeholder')}
                      value={friendCode}
                      maxLength={DASHBOARD_REFERRAL_CODE_MAX_LEN}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => setFriendCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void linkFriendReferral();
                      }}
                      className="bg-transparent border-none text-xs font-bold text-gray-400 placeholder:text-gray-700 px-3 w-full focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void linkFriendReferral()}
                      disabled={!sanitizeReferralInput(friendCode) || linkingReferral}
                      className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-[10px] font-black uppercase px-3 py-2 rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shrink-0"
                    >
                      {linkingReferral ? '...' : t('dashboard.link_referral')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-1 space-y-8">
          <DashboardEfficiencyCard
            freeRacks={freeRacks}
            inventoryCount={inventoryCount}
            loading={slotsLoading}
          />
          <DashboardActivityCard
            completionsToday={completionsToday}
            requiredForWaiver={requiredForWaiver}
            feeWaived={feeWaived}
            feeAlreadyChargedToday={feeAlreadyChargedToday}
            loading={feeInfoLoading}
          />
        </div>
      </div>
    </div>
  );
}
