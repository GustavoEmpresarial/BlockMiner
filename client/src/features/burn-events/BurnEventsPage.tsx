import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import {
  ArrowDownUp,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Flame,
  Gift,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  Timer,
  Trash2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import { api } from '../../shared/auth/auth.store';
import { resolveBurnApiError } from './lib/burnApiError';
import { MachineImage } from '../machines/components/MachineImage';
import { BurnMachineGroupCard } from './components/BurnMachineGroupCard';
import { BurnFeeSelector } from './components/BurnFeeSelector';
import {
  type BurnFeeCurrency,
  hasSufficientFeeBalance,
} from './lib/burnFee.config';
import {
  groupAndSortMachines,
  addOneFromGroup,
  removeOneFromGroup,
  autoSelectLowestPower,
  toggleMaxForRequirement,
  countToMeetRequirement,
  hashRateOutsideGroup,
  burnableLocationI18nKey,
  type BurnMachineGroup,
} from './lib/burnGroup.helpers';
import type { WalletBalanceResponse } from '../wallet/lib/wallet.types';

function burnLocationLabel(
  location: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  return t(burnableLocationI18nKey(location), { defaultValue: location });
}

function tr(t: (key: string, opts?: Record<string, unknown>) => string, key: string, fallback: string) {
  const v = t(key);
  return !v || v === key ? fallback : v;
}

interface RewardMiner {
  id: number;
  name: string;
  imageUrl: string | null;
  baseHashRate: number;
  slotSize: number;
  tier?: string;
}

interface BurnPendingSession {
  sessionId: number;
  eventId?: number;
  startedAt?: string;
  completesAt: string;
  burnDurationSeconds: number;
  ready: boolean;
}

interface BurnEvent {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  requiredHashRate: number;
  claimLimitPerUser: number;
  stockTotal: number | null;
  stockClaimed: number;
  startsAt: string | null;
  endsAt: string | null;
  burnDurationSeconds?: number;
  rewardMiner: RewardMiner;
  userClaimsCount: number;
  userCanClaim: boolean;
  isOpen?: boolean;
  pendingSession?: BurnPendingSession | null;
}

interface BurnableMachine {
  id: number;
  location: 'INVENTORY' | 'RACK' | string;
  minerName: string;
  hashRate: number;
  slotSize: number;
  imageUrl: string | null;
  level: number;
}

function resolveAssetUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const u = url.trim();
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (typeof window !== 'undefined' && u.startsWith('/')) return `${window.location.origin}${u}`;
  return u;
}

function formatHashRate(v: number): string {
  return `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })} H/s`;
}

function formatDurationClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function formatShortUtcDay(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function formatDateRange(startsAt: string | null, endsAt: string | null, locale: string): string | null {
  const a = formatShortUtcDay(startsAt, locale);
  const b = formatShortUtcDay(endsAt, locale);
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

type EventStatus = 'live' | 'upcoming' | 'limit' | 'closed';

function getEventStatus(event: BurnEvent, nowMs = Date.now()): EventStatus {
  const startsAtMs = event.startsAt ? new Date(event.startsAt).getTime() : null;
  const upcoming = startsAtMs != null && Number.isFinite(startsAtMs) && startsAtMs > nowMs;
  if (upcoming) return 'upcoming';
  const open = event.isOpen ?? true;
  if (open && !event.userCanClaim) return 'limit';
  if (open && event.userCanClaim) return 'live';
  return 'closed';
}

function StatusBadge({ status }: { status: EventStatus }) {
  const { t } = useTranslation();
  if (status === 'live') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
        {t('burnEvents.status_live', { defaultValue: 'Ao vivo' })}
      </span>
    );
  }
  if (status === 'upcoming') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-sky-300">
        <Clock className="h-3 w-3" />
        {t('burnEvents.status_upcoming', { defaultValue: 'Em breve' })}
      </span>
    );
  }
  if (status === 'limit') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
        <Lock className="h-3 w-3" />
        {t('burnEvents.status_limit', { defaultValue: 'Limite atingido' })}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
      <Clock className="h-3 w-3" />
      {t('burnEvents.status_closed', { defaultValue: 'Encerrado' })}
    </span>
  );
}

/** Showcase horizontal panorâmico para a placa de vídeo do minerador */
function BurnPrizeShowcase({
  src,
  name,
  hashRate,
}: {
  src: string | null;
  name: string;
  hashRate?: number;
}) {
  return (
    <div className="group/showcase relative flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-slate-800 bg-gradient-to-b from-slate-900/90 via-slate-950 to-slate-950 p-3 shadow-[inset_0_2px_12px_rgba(0,0,0,0.6)] sm:h-48">
      {/* Brilho âmbar de fundo */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-28 w-64 rounded-full bg-orange-500/15 blur-2xl transition-all duration-500 group-hover/showcase:bg-orange-500/25" />
      </div>

      {/* Imagem do minerador horizontal */}
      <div className="relative z-10 flex h-full w-full items-center justify-center px-4">
        {src ? (
          <MachineImage
            imageUrl={src}
            name={name}
            className="max-h-[88%] max-w-[94%] object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.7)] transition-transform duration-300 group-hover/showcase:scale-105"
          />
        ) : (
          <Cpu className="h-12 w-12 text-slate-700" />
        )}
      </div>

      {/* Badge de Hashrate no canto superior direito */}
      {hashRate != null ? (
        <div className="absolute right-3 top-3 rounded-xl border border-emerald-500/30 bg-slate-950/90 px-2.5 py-1 backdrop-blur-md shadow-md">
          <p className="font-mono text-xs font-black tracking-wide text-emerald-400">
            +{formatHashRate(hashRate)}
          </p>
        </div>
      ) : null}

      {/* Nome da máquina no canto inferior esquerdo */}
      <div className="absolute bottom-3 left-3 rounded-lg border border-slate-800 bg-slate-950/80 px-2.5 py-0.5 backdrop-blur-sm">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
          {name}
        </p>
      </div>
    </div>
  );
}

function EventCard({ event, onOpen }: { event: BurnEvent; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const status = getEventStatus(event);
  const pending = event.pendingSession ?? null;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!pending || pending.ready) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [pending]);

  const pendingRemainingMs = pending
    ? Math.max(0, new Date(pending.completesAt).getTime() - nowMs)
    : 0;
  const pendingReady = Boolean(pending && (pending.ready || pendingRemainingMs <= 0));

  const stockLabel =
    event.stockTotal == null
      ? t('burnEvents.stock_unlimited', { defaultValue: 'Sem limite' })
      : t('burnEvents.stock_left', {
          count: Math.max((event.stockTotal ?? 0) - (event.stockClaimed ?? 0), 0),
          defaultValue: `${Math.max((event.stockTotal ?? 0) - (event.stockClaimed ?? 0), 0)} restantes`,
        });

  const isUnlimitedClaims = event.claimLimitPerUser >= 99999;
  const claimLimitLabel = isUnlimitedClaims
    ? t('burnEvents.stock_unlimited', { defaultValue: 'Sem limite' })
    : `${event.userClaimsCount} / ${event.claimLimitPerUser}`;

  const img = resolveAssetUrl(event.rewardMiner.imageUrl || event.imageUrl);
  const range = formatDateRange(event.startsAt, event.endsAt, i18n.language || 'pt-BR');
  const burnMinutes =
    event.burnDurationSeconds != null && event.burnDurationSeconds > 0
      ? Math.max(1, Math.round(event.burnDurationSeconds / 60))
      : 15;

  return (
    <div className="group relative flex flex-col justify-between rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-[4px_4px_0px_#000000] transition-all hover:border-slate-700">
      <div className="space-y-4">
        {/* Topo: Badges de status e período */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {isUnlimitedClaims && status === 'live' && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                Ilimitado
              </span>
            )}
          </div>
          {range ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-400">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              {range} UTC
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              Sem prazo de término
            </span>
          )}
        </div>

        {/* Título e descrição do evento */}
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight text-white sm:text-2xl">
            {event.title}
          </h2>
          {event.description ? (
            <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-slate-400">
              {event.description}
            </p>
          ) : null}
        </div>

        {/* Showcase panorâmico da GPU premiada */}
        <BurnPrizeShowcase
          src={img}
          name={event.rewardMiner.name}
          hashRate={event.rewardMiner.baseHashRate}
        />

        {/* Painel de Métricas em Grid 3 Colunas Neobrutalista */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-3 shadow-[1px_1px_0px_#000000]">
            <div className="flex items-center gap-1.5 text-orange-400">
              <Flame className="h-3.5 w-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                {t('burnEvents.required_label', { defaultValue: 'Queima mínima' })}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs font-black text-white sm:text-sm">
              ≥ {formatHashRate(event.requiredHashRate)}
            </p>
          </div>

          <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-3 shadow-[1px_1px_0px_#000000]">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <Zap className="h-3.5 w-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                {t('burnEvents.prize', { defaultValue: 'Prêmio' })}
              </span>
            </div>
            <p className="mt-1 truncate font-mono text-xs font-black text-emerald-400 sm:text-sm">
              +{formatHashRate(event.rewardMiner.baseHashRate)}
            </p>
          </div>

          <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-3 shadow-[1px_1px_0px_#000000]">
            <div className="flex items-center gap-1.5 text-sky-400">
              <Gift className="h-3.5 w-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                {t('burnEvents.your_claims', { defaultValue: 'Limite' })}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs font-black text-white sm:text-sm">
              {claimLimitLabel}
            </p>
          </div>
        </div>
      </div>

      {/* Botão de Ação / Rodapé */}
      <div className="mt-5 border-t-2 border-slate-800 pt-4">
        {pending ? (
          <button
            type="button"
            onClick={onOpen}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all active:translate-x-0.5 active:translate-y-0.5 ${
              pendingReady
                ? 'border-2 border-emerald-400/80 bg-emerald-500 hover:bg-emerald-400'
                : 'border-2 border-orange-400/80 bg-orange-500 hover:bg-orange-400'
            }`}
          >
            <Flame className="h-4 w-4" />
            {pendingReady
              ? t('burnEvents.enter_to_collect', { defaultValue: 'Queima Pronta — Coletar Prêmio →' })
              : `${t('burnEvents.burning_title', { defaultValue: 'Queima em andamento' })} (${formatDurationClock(pendingRemainingMs / 1000)}) →`}
          </button>
        ) : status === 'limit' ? (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-800 bg-slate-950/80 py-3.5 text-xs font-bold text-amber-300">
            <Lock className="h-4 w-4" />
            {t('burnEvents.limit_reached', { limit: event.claimLimitPerUser })}
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-400/80 bg-amber-500 py-3.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all hover:bg-amber-400 active:translate-x-0.5 active:translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Flame className="h-4 w-4" />
            {t('burnEvents.enter_event', { defaultValue: 'Participar da Queima' })} →
          </button>
        )}
      </div>
    </div>
  );
}

function EventDetail({
  event,
  onClose,
  onClaimed,
}: {
  event: BurnEvent;
  onClose: () => void;
  onClaimed: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [machines, setMachines] = useState<BurnableMachine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feeCurrency, setFeeCurrency] = useState<BurnFeeCurrency>('SHIB');
  const [balances, setBalances] = useState<{ shib: number; pol: number; blk: number }>({
    shib: 0,
    pol: 0,
    blk: 0,
  });
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [burning, setBurning] = useState<{
    sessionId: number;
    completesAtMs: number;
    durationSeconds: number;
  } | null>(() => {
    const p = event.pendingSession;
    if (!p) return null;
    return {
      sessionId: p.sessionId,
      completesAtMs: new Date(p.completesAt).getTime(),
      durationSeconds: Math.max(0, p.burnDurationSeconds),
    };
  });
  const [burnNowMs, setBurnNowMs] = useState(() => Date.now());
  const [sessionLoading, setSessionLoading] = useState(!event.pendingSession);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; machines?: BurnableMachine[]; message?: string }>(
        '/burn-events/my-machines',
      );
      if (!res.data.ok) throw new Error(res.data.message);
      setMachines(res.data.machines ?? []);
    } catch (e) {
      toast.error(resolveBurnApiError(e, t, t('burnEvents.load_machines_error')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadPendingSession = useCallback(async () => {
    setSessionLoading(true);
    try {
      const res = await api.get<{
        ok: boolean;
        session?: {
          sessionId: number;
          completesAt: string;
          burnDurationSeconds: number;
          ready: boolean;
        } | null;
      }>(`/burn-events/${event.id}/session`);
      if (!res.data.ok) return;
      const s = res.data.session;
      if (!s) {
        setBurning(null);
        return;
      }
      setBurning({
        sessionId: s.sessionId,
        completesAtMs: new Date(s.completesAt).getTime(),
        durationSeconds: Math.max(0, s.burnDurationSeconds),
      });
    } catch {
      // Non-fatal
    } finally {
      setSessionLoading(false);
    }
  }, [event.id]);

  const loadBalances = useCallback(async () => {
    setLoadingBalances(true);
    try {
      const res = await api.get<WalletBalanceResponse>('/wallet/balance');
      if (res.data) {
        const pol = Number(res.data.polBalance ?? res.data.balance ?? 0);
        const shib = Number(res.data.shibBalance ?? 0);
        const blk = Number(res.data.blkBalance ?? 0);
        setBalances({ pol, shib, blk });
      }
    } catch {
      // Keep existing balances
    } finally {
      setLoadingBalances(false);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadBalances();
    void loadPendingSession();
  }, [load, loadBalances, loadPendingSession]);

  useEffect(() => {
    if (!burning) return;
    setBurnNowMs(Date.now());
    const id = window.setInterval(() => setBurnNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [burning]);

  const machineGroups = useMemo(
    () => groupAndSortMachines(machines, selected),
    [machines, selected],
  );

  const selectedGroups = useMemo(
    () => machineGroups.filter((g) => g.selectedCount > 0),
    [machineGroups],
  );

  const handleAdd = (group: BurnMachineGroup) => {
    setSelected((prev) => addOneFromGroup(group, prev));
  };

  const handleRemove = (group: BurnMachineGroup) => {
    setSelected((prev) => removeOneFromGroup(group, prev));
  };

  const handleToggleMax = (group: BurnMachineGroup) => {
    setSelected((prev) =>
      toggleMaxForRequirement(group, prev, machines, event.requiredHashRate),
    );
  };

  const handleAutoSelectLowest = () => {
    const autoSel = autoSelectLowestPower(machineGroups, event.requiredHashRate);
    setSelected(autoSel);
    toast.info(t('burnEvents.auto_select_lowest'));
  };

  const handleClearSelection = () => {
    setSelected(new Set());
  };

  const totalSelectedHashRate = useMemo(
    () => machines.filter((m) => selected.has(m.id)).reduce((s, m) => s + Number(m.hashRate || 0), 0),
    [machines, selected],
  );

  const isFeeSufficient = hasSufficientFeeBalance(feeCurrency, balances);

  const canClaim =
    event.isOpen !== false &&
    event.userCanClaim &&
    totalSelectedHashRate >= event.requiredHashRate &&
    selected.size > 0 &&
    isFeeSufficient;

  const progress = Math.min(100, (totalSelectedHashRate / event.requiredHashRate) * 100);
  const prizeImg = resolveAssetUrl(event.rewardMiner.imageUrl || event.imageUrl);
  const range = formatDateRange(event.startsAt, event.endsAt, i18n.language || 'pt-BR');

  const isUnlimitedClaims = event.claimLimitPerUser >= 99999;
  const stockLabel =
    event.stockTotal == null
      ? t('burnEvents.stock_unlimited', { defaultValue: 'Sem limite' })
      : t('burnEvents.stock_left', {
          count: Math.max((event.stockTotal ?? 0) - (event.stockClaimed ?? 0), 0),
        });

  const burnRemainingMs = burning ? Math.max(0, burning.completesAtMs - burnNowMs) : 0;
  const burnProgressPct = burning
    ? Math.min(
        100,
        ((burning.durationSeconds * 1000 - burnRemainingMs) / Math.max(1, burning.durationSeconds * 1000)) *
          100,
      )
    : 0;
  const burnReady = Boolean(burning && burnRemainingMs <= 0);

  const finishClaim = useCallback(
    async (sessionId: number) => {
      setSubmitting(true);
      try {
        const res = await api.post<{ ok: boolean; message?: string; code?: string }>(
          `/burn-events/${event.id}/claim`,
          { sessionId },
        );
        if (!res.data.ok) throw new Error(res.data.message);
        toast.success(t('burnEvents.claim_success', { miner: event.rewardMiner.name }));
        setBurning(null);
        setSelected(new Set());
        void loadBalances();
        void load();
        onClaimed();
      } catch (e) {
        toast.error(resolveBurnApiError(e, t, t('burnEvents.claim_error')));
      } finally {
        setSubmitting(false);
      }
    },
    [event.id, event.rewardMiner.name, onClaimed, loadBalances, load, t],
  );

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await api.post<{
        ok: boolean;
        sessionId?: number;
        completesAt?: string;
        burnDurationSeconds?: number;
        feePaid?: { currency: string; amount: number };
        message?: string;
        code?: string;
      }>(`/burn-events/${event.id}/start`, {
        minerIds: Array.from(selected),
        feeCurrency,
      });
      if (!res.data.ok || res.data.sessionId == null || !res.data.completesAt) {
        throw new Error(res.data.message);
      }
      const durationSeconds =
        res.data.burnDurationSeconds ??
        event.burnDurationSeconds ??
        Math.max(0, Math.round((new Date(res.data.completesAt).getTime() - Date.now()) / 1000));
      setConfirming(false);
      setSelected(new Set());
      void loadBalances();
      void load();
      setBurning({
        sessionId: res.data.sessionId,
        completesAtMs: new Date(res.data.completesAt).getTime(),
        durationSeconds: Math.max(0, durationSeconds),
      });
      const feePaid = res.data.feePaid;
      const feeLabel =
        feePaid && feePaid.amount != null && feePaid.currency
          ? `${feePaid.amount} ${feePaid.currency}`
          : null;
      toast.success(
        feeLabel
          ? t('burnEvents.start_success_fee', {
              fee: feeLabel,
              defaultValue: `Máquinas queimadas. Taxa debitada: ${feeLabel}. Pode sair — o prêmio vai para a caixa de entrada.`,
            })
          : t('burnEvents.start_success', {
              defaultValue:
                'Máquinas queimadas. Pode sair e voltar depois — o prêmio vai para a caixa de entrada.',
            }),
      );
    } catch (e) {
      toast.error(resolveBurnApiError(e, t, t('burnEvents.start_error')));
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Botão de navegação voltar */}
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-800 bg-slate-900/60 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-300 transition-all hover:border-slate-700 hover:text-white active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000]"
      >
        <ChevronLeft className="h-4 w-4" /> {t('burnEvents.back', { defaultValue: 'Voltar aos eventos' })}
      </button>

      {/* Hero do Evento com visual panorâmico */}
      <div className="rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-6 sm:p-8 shadow-[4px_4px_0px_#000000]">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
          {/* Showcase horizontal à esquerda */}
          <div className="lg:col-span-5">
            <BurnPrizeShowcase
              src={prizeImg}
              name={event.rewardMiner.name}
              hashRate={event.rewardMiner.baseHashRate}
            />
          </div>

          {/* Dados do Evento à direita */}
          <div className="space-y-4 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={getEventStatus(event)} />
              {range ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-400">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  {range} UTC
                </span>
              ) : (
                <span className="font-mono text-xs text-slate-500">Sem prazo de término</span>
              )}
            </div>

            <div>
              <p className="font-mono text-[10px] font-black uppercase tracking-widest text-orange-400">
                {t('burnEvents.prize', { defaultValue: 'Prêmio de Recompensa' })}
              </p>
              <h1 className="text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
                {event.rewardMiner.name}
              </h1>
              <p className="mt-1 text-sm font-medium leading-relaxed text-slate-400">
                {event.description || event.title}
              </p>
            </div>

            {/* Estatísticas em 3 blocos */}
            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-3 shadow-[1px_1px_0px_#000000]">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {t('burnEvents.required_label', { defaultValue: 'Queima mínima' })}
                </p>
                <p className="mt-1 font-mono text-xs font-black text-orange-400 sm:text-sm">
                  ≥ {formatHashRate(event.requiredHashRate)}
                </p>
              </div>

              <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-3 shadow-[1px_1px_0px_#000000]">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {t('burnEvents.stock_label', { defaultValue: 'Estoque' })}
                </p>
                <p className="mt-1 font-mono text-xs font-black text-white sm:text-sm">
                  {stockLabel}
                </p>
              </div>

              <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-3 shadow-[1px_1px_0px_#000000]">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                  {t('burnEvents.your_claims', { defaultValue: 'Suas queimas' })}
                </p>
                <p className="mt-1 font-mono text-xs font-black text-white sm:text-sm">
                  {isUnlimitedClaims ? 'Ilimitado' : `${event.userClaimsCount} / ${event.claimLimitPerUser}`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card de queima ativa no servidor */}
      {burning ? (
        <div className="rounded-3xl border-2 border-amber-500/40 bg-amber-950/20 p-6 shadow-[4px_4px_0px_#000000]">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-amber-500/40 bg-amber-500/20 shadow-[1px_1px_0px_#000000]">
              <Flame className={`h-6 w-6 text-amber-400 ${burnReady ? '' : 'animate-pulse'}`} />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-base font-black uppercase tracking-tight text-white">
                  {burnReady
                    ? t('burnEvents.ready_title', { defaultValue: 'Queima Concluída!' })
                    : t('burnEvents.burning_title', { defaultValue: 'Queima em andamento no servidor' })}
                </p>
                <p className="mt-0.5 text-xs font-medium text-slate-300">
                  {burnReady
                    ? t('burnEvents.ready_body', {
                        defaultValue: 'O processo terminou com sucesso. Resgate seu minerador agora.',
                      })
                    : t('burnEvents.burning_body_server', {
                        defaultValue: 'As máquinas foram destruídas. O processo roda no servidor — você pode fechar ou navegar normalmente.',
                      })}
                </p>
              </div>

              {!burnReady ? (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-slate-400">
                      {t('burnEvents.burning_wait', { defaultValue: 'Tempo restante' })}:
                    </span>
                    <span className="text-sm font-black text-orange-400">
                      {formatDurationClock(burnRemainingMs / 1000)}
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full border border-slate-800 bg-slate-950">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-1000 shadow-[0_0_12px_rgba(249,115,22,0.5)]"
                      style={{ width: `${burnProgressPct}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void finishClaim(burning.sessionId)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-emerald-400/80 bg-emerald-500 py-3.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all hover:bg-emerald-400 active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                  {t('burnEvents.collect_reward', { defaultValue: 'Coletar Recompensa na Caixa de Entrada' })}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Painel Sticky de Progresso e Ação */}
      {!burning ? (
        <div className="sticky top-20 z-20 space-y-4 rounded-3xl border-2 border-slate-800 bg-slate-900/90 p-5 backdrop-blur-md shadow-[4px_4px_0px_#000000]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {t('burnEvents.progress', { defaultValue: 'Progresso da Queima' })}
              </span>
              <p className="text-xs font-medium text-slate-400">
                Selecione máquinas da sua lista abaixo até atingir a meta
              </p>
            </div>
            <div className="text-right">
              <span
                className={`font-mono text-sm font-black ${
                  totalSelectedHashRate >= event.requiredHashRate
                    ? 'text-emerald-400'
                    : 'text-orange-400'
                }`}
              >
                {formatHashRate(totalSelectedHashRate)}
              </span>
              <span className="font-mono text-xs text-slate-500"> / {formatHashRate(event.requiredHashRate)}</span>
            </div>
          </div>

          <div className="h-3 overflow-hidden rounded-full border border-slate-800 bg-slate-950">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                totalSelectedHashRate >= event.requiredHashRate
                  ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                  : 'bg-amber-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="border-t-2 border-slate-800 pt-3">
            <BurnFeeSelector
              selectedCurrency={feeCurrency}
              onSelectCurrency={setFeeCurrency}
              balances={balances}
              loadingBalances={loadingBalances}
              disabled={submitting}
            />
          </div>

          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!canClaim || submitting || sessionLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-amber-400/80 bg-amber-500 py-3.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all hover:bg-amber-400 active:translate-x-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <Flame className="h-4 w-4" />
            {t('burnEvents.burn_and_claim', {
              count: selected.size,
              defaultValue: `Queimar ${selected.size} máquina(s) selecionada(s)`,
            })}
          </button>
        </div>
      ) : null}

      {/* Lista de Máquinas Disponíveis */}
      {!burning ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black uppercase tracking-tight text-white">
                {t('burnEvents.your_machines', { defaultValue: 'Suas Máquinas Disponíveis' })}
              </h3>
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 font-mono text-[10px] font-bold text-slate-300">
                {machines.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAutoSelectLowest}
                disabled={machines.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-orange-300 shadow-[2px_2px_0px_#000000] transition-all hover:bg-orange-500/20 active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5 text-orange-400" />
                <span>{t('burnEvents.auto_select_lowest', { defaultValue: 'Menor poder primeiro' })}</span>
              </button>

              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="inline-flex items-center gap-1.5 rounded-xl border-2 border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-300 shadow-[2px_2px_0px_#000000] transition-all hover:bg-slate-700 active:translate-x-0.5 active:translate-y-0.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{t('burnEvents.clear_selection', { defaultValue: 'Limpar seleção' })}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  void load();
                  void loadBalances();
                }}
                className="rounded-xl border-2 border-slate-800 bg-slate-900/60 p-2 text-slate-400 shadow-[2px_2px_0px_#000000] transition-all hover:text-white active:translate-x-0.5 active:translate-y-0.5"
                title="Atualizar lista"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-slate-800 bg-slate-900/40 py-16">
              <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
              <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                {t('common.loading', { defaultValue: 'Carregando máquinas...' })}
              </p>
            </div>
          ) : machineGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/40 py-16 text-center text-slate-400">
              <Cpu className="mb-3 h-12 w-12 text-slate-600 opacity-40" />
              <p className="text-sm font-black uppercase tracking-tight text-white">
                {t('burnEvents.no_machines', { defaultValue: 'Nenhuma máquina disponível para queima' })}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-400">
                Máquinas instaladas em salas devem ser guardadas no inventário ou cofre para queimar.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {machineGroups.map((group) => {
                const otherHash = hashRateOutsideGroup(group, machines, selected);
                const needed = countToMeetRequirement(group, event.requiredHashRate, otherHash);
                const isFilledToRequirement =
                  group.selectedCount > 0 && group.selectedCount >= needed;
                return (
                  <BurnMachineGroupCard
                    key={group.groupKey}
                    group={group}
                    isFilledToRequirement={isFilledToRequirement}
                    onAdd={() => handleAdd(group)}
                    onRemove={() => handleRemove(group)}
                    onToggleMax={() => handleToggleMax(group)}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* Modal de Confirmação */}
      {confirming && !burning && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => !submitting && setConfirming(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="burn-confirm-title"
                onClick={(e) => e.stopPropagation()}
                className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl border-2 border-slate-800 bg-slate-900 p-6 sm:p-7 shadow-[4px_4px_0px_#000000] animate-in zoom-in-95 duration-200"
              >
                <div className="flex items-center gap-3 border-b-2 border-slate-800 pb-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-red-500/40 bg-red-500/20 shadow-[1px_1px_0px_#000000]">
                    <Flame className="h-6 w-6 text-red-400" />
                  </div>
                  <div>
                    <h3 id="burn-confirm-title" className="text-lg font-black uppercase tracking-tight text-white">
                      {t('burnEvents.confirm_title', { defaultValue: 'Confirmar Destruição das Máquinas' })}
                    </h3>
                    <p className="text-xs font-medium text-slate-400">
                      {t('burnEvents.confirm_body', { defaultValue: 'Esta ação destruirá permanentemente as máquinas selecionadas.' })}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/60 p-3.5 shadow-[2px_2px_0px_#000000]">
                  <BurnFeeSelector
                    selectedCurrency={feeCurrency}
                    onSelectCurrency={setFeeCurrency}
                    balances={balances}
                    loadingBalances={loadingBalances}
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400 font-bold">
                    <span>Máquinas a queimar ({selected.size} selecionadas):</span>
                    <span className="font-mono text-orange-400">
                      {formatHashRate(totalSelectedHashRate)}
                    </span>
                  </div>
                  <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-2xl border-2 border-slate-800 bg-slate-950/60 p-3 shadow-[1px_1px_0px_#000000]">
                    {selectedGroups.map((g) => (
                      <div key={g.groupKey} className="flex items-center justify-between text-xs">
                        <span className="mr-2 truncate text-slate-300">
                          <strong className="text-white">{g.selectedCount}x</strong> {g.minerName}{' '}
                          <span className="text-[10px] font-medium text-slate-400">
                            ({burnLocationLabel(g.location, t)})
                          </span>
                        </span>
                        <span className="shrink-0 font-mono font-bold text-slate-400">
                          {formatHashRate(g.selectedCount * g.hashRate)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border-2 border-emerald-500/30 bg-emerald-950/20 p-3.5 text-xs shadow-[1px_1px_0px_#000000]">
                  <p className="font-black uppercase tracking-wider text-emerald-400">
                    {t('burnEvents.you_receive', { defaultValue: 'Você vai receber:' })}
                  </p>
                  <p className="mt-1 font-mono text-sm font-black text-white">
                    {event.rewardMiner.name} (+{formatHashRate(event.rewardMiner.baseHashRate)})
                  </p>
                  <p className="mt-0.5 font-medium text-slate-400">
                    {t('burnEvents.goes_to_inbox', { defaultValue: 'A máquina será entregue na sua caixa de entrada.' })}
                  </p>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setConfirming(false)}
                    className="flex-1 rounded-xl border-2 border-slate-700 bg-slate-800 py-3 text-xs font-black uppercase tracking-wider text-slate-300 shadow-[2px_2px_0px_#000000] transition-all hover:border-slate-600 hover:text-white active:translate-x-0.5 active:translate-y-0.5"
                  >
                    {t('burnEvents.cancel', { defaultValue: 'Cancelar' })}
                  </button>
                  <button
                    type="button"
                    disabled={submitting || !isFeeSufficient}
                    onClick={() => void submit()}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-xs font-black uppercase tracking-wider text-white shadow-[2px_2px_0px_#000000] transition-all hover:bg-red-500 active:translate-x-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                    {t('burnEvents.confirm_burn', { defaultValue: 'Confirmar Queima' })}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function formatBurnEventsLoadError(
  e: unknown,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const base = resolveBurnApiError(e, t, t('burnEvents.load_error'));
  if (!isAxiosError(e)) return base;
  const status = e.response?.status;
  const code =
    e.response?.data && typeof e.response.data === 'object' && 'code' in e.response.data
      ? String((e.response.data as { code?: unknown }).code ?? '')
      : '';
  const parts: string[] = [];
  if (status != null) parts.push(`HTTP ${status}`);
  if (code.trim()) parts.push(code.trim());
  parts.push(base);
  return parts.join(' · ');
}

export default function BurnEventsPage() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<BurnEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<BurnEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await api.get<{ ok: boolean; events?: BurnEvent[]; message?: string }>('/burn-events');
      if (!res.data.ok) throw new Error(res.data.message);
      setEvents(res.data.events ?? []);
    } catch (e) {
      setEvents([]);
      setLoadFailed(true);
      toast.error(formatBurnEventsLoadError(e, t));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (selected) {
    return (
      <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <EventDetail
          event={selected}
          onClose={() => setSelected(null)}
          onClaimed={() => {
            setSelected(null);
            void load();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header Neobrutalista no mesmo padrão de Tarefas e Torneios */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3">
          <IconBadge icon={Flame} variant="amber" size="lg" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              {t('burnEvents.title', { defaultValue: 'Eventos de Queima' })}
            </h1>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border-2 border-slate-800 text-slate-300 text-xs font-black uppercase tracking-wider hover:border-slate-700 hover:text-white active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000] transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary w-fit"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh', { defaultValue: 'Atualizar' })}
        </button>
      </div>

      {loading ? (
        <Card className="h-[40vh] flex flex-col items-center justify-center gap-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-slate-400 font-extrabold uppercase tracking-widest text-xs">
            {t('common.loading', { defaultValue: 'Carregando eventos...' })}
          </p>
        </Card>
      ) : loadFailed ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-4 px-6 border-red-500/30 bg-red-950/20 shadow-[2px_2px_0px_#000000]">
          <p className="text-sm font-black text-red-400 uppercase tracking-tight">
            {t('burnEvents.load_error', { defaultValue: 'Erro ao carregar eventos de queima.' })}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-700 bg-slate-900 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:border-slate-600 active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000] transition-all"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('common.retry', { defaultValue: 'Tentar novamente' })}
          </button>
        </Card>
      ) : events.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-2">
          <Flame className="mb-2 h-12 w-12 text-slate-600 opacity-40" />
          <p className="text-sm font-black uppercase tracking-tight text-white">
            {t('burnEvents.empty', { defaultValue: 'Nenhum evento de queima ativo' })}
          </p>
          <p className="text-xs text-slate-400 font-medium">
            {t('burnEvents.empty_hint', { defaultValue: 'Novos eventos de queima aparecerão aqui em breve.' })}
          </p>
        </Card>
      ) : (
        /* Grid responsivo em 2 colunas */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {events.map((e) => (
            <EventCard key={e.id} event={e} onOpen={() => setSelected(e)} />
          ))}
        </div>
      )}
    </div>
  );
}
