import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Cpu,
  Flame,
  Gift,
  Loader2,
  Lock,
  RefreshCw,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import { api } from '../../shared/auth/auth.store';
import { resolveApiErrorMessage } from '../../shared/utils/apiErrorI18n';
import { MachineImage } from '../machines/components/MachineImage';

function tr(t: (key: string, opts?: Record<string, unknown>) => string, key: string, fallback: string) {
  const v = t(key);
  return !v || v === key ? fallback : v;
}

function BurnPrizeImage({
  src,
  name,
  hashRate,
  variant = 'card',
}: {
  src: string | null;
  name: string;
  hashRate?: number;
  variant?: 'card' | 'detail';
}) {
  const isDetail = variant === 'detail';

  return (
    <div
      className={`relative mx-auto ${isDetail ? 'h-48 w-32 sm:h-52 sm:w-36' : 'h-40 w-28 sm:h-44 sm:w-[7.25rem]'}`}
    >
      <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
        <div className="h-16 w-16 animate-pulse rounded-full bg-orange-500/20 blur-xl" />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-20 w-14 -translate-x-1/2 rounded-full bg-emerald-400/10 blur-xl" />
      <div className="pointer-events-none absolute bottom-2 left-1/2 h-2 w-[65%] -translate-x-1/2 rounded-full bg-orange-500/15 blur-sm" />

      <div className="relative flex h-full w-full flex-col items-center justify-end overflow-visible rounded-[1.5rem] border border-orange-400/25 bg-gradient-to-b from-slate-700/40 via-slate-900/90 to-slate-950 p-2 pt-4 shadow-[0_0_28px_rgba(249,115,22,0.18)] ring-1 ring-orange-300/15">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 rounded-t-[1.5rem] bg-gradient-to-b from-white/10 to-transparent" />

        <div className="relative flex w-full flex-1 items-center justify-center pb-7">
          {src ? (
            <MachineImage
              imageUrl={src}
              name={name}
              className="max-h-[82%] max-w-[90%] object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.45)] transition-transform duration-500 group-hover:scale-105 group-hover:-translate-y-0.5"
            />
          ) : (
            <Cpu className="h-10 w-10 text-slate-600" />
          )}
        </div>

        {hashRate != null ? (
          <div className="absolute inset-x-1.5 bottom-1.5 rounded-lg border border-emerald-500/20 bg-slate-950/85 px-1.5 py-1 backdrop-blur-sm">
            <p className="text-center text-[9px] font-black tracking-wide text-emerald-300">
              {formatHashRate(hashRate)}
            </p>
          </div>
        ) : null}

        <div className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-orange-300/35 bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg shadow-orange-500/40">
          <Flame className="h-4 w-4 text-white drop-shadow" />
        </div>
      </div>
    </div>
  );
}

function BurnMachineThumb({ src, name }: { src: string | null; name: string }) {
  return (
    <div className="relative flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-orange-500/15 bg-gradient-to-b from-slate-800 to-slate-950 p-1 shadow-sm shadow-orange-500/10">
      <div className="pointer-events-none absolute inset-x-1 bottom-0 h-4 rounded-full bg-orange-500/15 blur-sm" />
      {src ? (
        <MachineImage
          imageUrl={src}
          name={name}
          className="relative max-h-full max-w-full object-contain drop-shadow-md"
        />
      ) : (
        <Cpu className="h-5 w-5 text-slate-600" />
      )}
    </div>
  );
}

interface RewardMiner {
  id: number;
  name: string;
  imageUrl: string | null;
  baseHashRate: number;
  slotSize: number;
  tier?: string;
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
  /** Seconds the burn process must run before claim (from BURN_PROCESS_DURATION_SECONDS). */
  burnDurationSeconds?: number;
  rewardMiner: RewardMiner;
  userClaimsCount: number;
  userCanClaim: boolean;
  isOpen?: boolean;
}

function formatDurationClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/25 bg-orange-500/15 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-orange-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
        {t('burnEvents.status_live')}
      </span>
    );
  }
  if (status === 'upcoming') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-sky-300">
        <Clock className="h-3 w-3" />
        {t('burnEvents.status_upcoming')}
      </span>
    );
  }
  if (status === 'limit') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-amber-300">
        <Lock className="h-3 w-3" />
        {t('burnEvents.status_limit')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-500/30 bg-slate-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
      <Clock className="h-3 w-3" />
      {t('burnEvents.status_closed')}
    </span>
  );
}

function EventCard({ event, onOpen }: { event: BurnEvent; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const status = getEventStatus(event);
  const stockLabel =
    event.stockTotal == null
      ? t('burnEvents.stock_unlimited')
      : t('burnEvents.stock_left', {
          count: Math.max(event.stockTotal - event.stockClaimed, 0),
        });
  const img = resolveAssetUrl(event.rewardMiner.imageUrl || event.imageUrl);
  const range = formatDateRange(event.startsAt, event.endsAt, i18n.language || 'pt-BR');
  const canOpen = status !== 'limit';
  const burnMinutes =
    event.burnDurationSeconds != null && event.burnDurationSeconds > 0
      ? Math.max(1, Math.round(event.burnDurationSeconds / 60))
      : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!canOpen}
      className={`group relative w-full overflow-hidden rounded-[2rem] border p-5 text-left shadow-xl transition-all duration-300 sm:p-6 ${ canOpen ? 'border-orange-500/25 bg-slate-950/80 hover:bg-slate-900' : 'cursor-not-allowed border-white/10 bg-slate-950/50 opacity-80' }`}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-orange-500/15 blur-3xl transition-opacity duration-500" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-amber-500/10 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-5">
        <div className="flex justify-center py-1">
          <BurnPrizeImage
            src={img}
            name={event.rewardMiner.name}
            hashRate={event.rewardMiner.baseHashRate}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            {range ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                {range}
                <span className="text-[9px] uppercase tracking-wider text-slate-600">UTC</span>
              </span>
            ) : null}
          </div>

          <div>
            <h2 className="text-lg font-black tracking-tight text-white sm:text-xl">{event.title}</h2>
            {event.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-slate-400">{event.description}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 px-3.5 py-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500/70">
              {t('burnEvents.prize')}
            </p>
            <p className="mt-0.5 truncate text-sm font-black text-white">{event.rewardMiner.name}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-orange-500/20 bg-orange-500/10 px-2.5 py-1.5 text-[10px] font-bold text-orange-300">
              <Flame className="h-3 w-3" />
              {t('burnEvents.burn_at_least')} {formatHashRate(event.requiredHashRate)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/70 px-2.5 py-1.5 text-[10px] font-bold text-slate-300">
              <Gift className="h-3 w-3 text-slate-400" />
              {stockLabel}
            </span>
            {burnMinutes != null ? (
              <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/70 px-2.5 py-1.5 text-[10px] font-bold text-slate-300">
                <Timer className="h-3 w-3 text-slate-400" />
                {t('burnEvents.burn_duration', { minutes: burnMinutes })}
              </span>
            ) : null}
          </div>

          {status === 'limit' ? (
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300/90">
              <Lock className="h-3.5 w-3.5" />
              {t('burnEvents.limit_reached', { limit: event.claimLimitPerUser })}
            </p>
          ) : status === 'upcoming' && event.startsAt ? (
            <p className="text-[11px] font-bold text-sky-300">
              {tr(t, 'burnEvents.opens_at', 'Abre em {{date}} UTC').replace(
                '{{date}}',
                new Date(event.startsAt).toLocaleString(undefined, {
                  timeZone: 'UTC',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              )}
            </p>
          ) : (
            <p className="text-[11px] font-black uppercase tracking-widest text-orange-400 transition-colors text-orange-400">
              {t('burnEvents.enter_event')} →
            </p>
          )}
        </div>
      </div>
    </button>
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
  const [burning, setBurning] = useState<{
    sessionId: number;
    completesAtMs: number;
    durationSeconds: number;
  } | null>(null);
  const [burnNowMs, setBurnNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ ok: boolean; machines?: BurnableMachine[]; message?: string }>(
        '/burn-events/my-machines',
      );
      if (!res.data.ok) throw new Error(res.data.message);
      setMachines(res.data.machines ?? []);
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, t('burnEvents.load_machines_error')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!burning) return;
    setBurnNowMs(Date.now());
    const id = window.setInterval(() => setBurnNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [burning]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalSelectedHashRate = useMemo(
    () => machines.filter((m) => selected.has(m.id)).reduce((s, m) => s + Number(m.hashRate || 0), 0),
    [machines, selected],
  );

  const canClaim =
    event.isOpen !== false &&
    event.userCanClaim &&
    totalSelectedHashRate >= event.requiredHashRate &&
    selected.size > 0;
  const progress = Math.min(100, (totalSelectedHashRate / event.requiredHashRate) * 100);
  const selectedMachines = machines.filter((m) => selected.has(m.id));
  const prizeImg = resolveAssetUrl(event.rewardMiner.imageUrl || event.imageUrl);
  const range = formatDateRange(event.startsAt, event.endsAt, i18n.language || 'pt-BR');
  const stockLabel =
    event.stockTotal == null
      ? t('burnEvents.stock_unlimited')
      : t('burnEvents.stock_left', {
          count: Math.max(event.stockTotal - event.stockClaimed, 0),
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
        onClaimed();
      } catch (e) {
        toast.error(resolveApiErrorMessage(e, t('burnEvents.claim_error')));
      } finally {
        setSubmitting(false);
      }
    },
    [event.id, event.rewardMiner.name, onClaimed, t],
  );

  useEffect(() => {
    if (!burning || !burnReady || submitting) return;
    void finishClaim(burning.sessionId);
  }, [burning, burnReady, submitting, finishClaim]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await api.post<{
        ok: boolean;
        sessionId?: number;
        completesAt?: string;
        burnDurationSeconds?: number;
        message?: string;
        code?: string;
      }>(`/burn-events/${event.id}/start`, { minerIds: Array.from(selected) });
      if (!res.data.ok || res.data.sessionId == null || !res.data.completesAt) {
        throw new Error(res.data.message);
      }
      const durationSeconds =
        res.data.burnDurationSeconds ??
        event.burnDurationSeconds ??
        Math.max(0, Math.round((new Date(res.data.completesAt).getTime() - Date.now()) / 1000));
      setConfirming(false);
      setBurning({
        sessionId: res.data.sessionId,
        completesAtMs: new Date(res.data.completesAt).getTime(),
        durationSeconds: Math.max(0, durationSeconds),
      });
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, t('burnEvents.start_error')));
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-white/20 hover:text-white"
      >
        <ChevronLeft className="h-4 w-4" /> {t('burnEvents.back')}
      </button>

      <div className="relative overflow-hidden rounded-[2rem] border border-orange-500/25 bg-gradient-to-br from-orange-900/30 via-slate-900 to-slate-900 p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative z-10 flex flex-col items-center gap-5 text-center sm:items-start sm:text-left">
          <BurnPrizeImage
            src={prizeImg}
            name={event.rewardMiner.name}
            hashRate={event.rewardMiner.baseHashRate}
            variant="detail"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <StatusBadge status={getEventStatus(event)} />
              {range ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Calendar className="h-3.5 w-3.5" />
                  {range} UTC
                </span>
              ) : null}
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-orange-400">
              {t('burnEvents.prize')}
            </p>
            <h2 className="text-2xl font-black tracking-tight text-white">{event.rewardMiner.name}</h2>
            <p className="text-sm font-bold text-emerald-400">
              {formatHashRate(event.rewardMiner.baseHashRate)}
            </p>
            <p className="text-sm font-black text-white/90">{event.title}</p>
            {event.description ? <p className="text-xs text-slate-400">{event.description}</p> : null}
          </div>
        </div>

        <div className="relative z-10 mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
              {t('burnEvents.required_label')}
            </p>
            <p className="mt-1 text-sm font-black text-orange-300">
              {formatHashRate(event.requiredHashRate)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
              {t('burnEvents.stock_label')}
            </p>
            <p className="mt-1 text-sm font-black text-white">{stockLabel}</p>
          </div>
          <div className="col-span-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 sm:col-span-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">
              {t('burnEvents.your_claims')}
            </p>
            <p className="mt-1 text-sm font-black text-white">
              {event.userClaimsCount} / {event.claimLimitPerUser}
            </p>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 rounded-[1.75rem] border border-orange-500/20 bg-slate-950/95 p-4 shadow-lg shadow-black/40 backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {t('burnEvents.progress')}
          </span>
          <span className={`text-xs font-black ${canClaim ? 'text-emerald-400' : 'text-orange-300'}`}>
            {formatHashRate(totalSelectedHashRate)} / {formatHashRate(event.requiredHashRate)}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full rounded-full transition-all duration-300 ${ canClaim ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-orange-500 to-amber-400' }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={!canClaim || submitting}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 py-3.5 text-sm font-black text-white shadow-lg shadow-orange-500/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          <Flame className="h-4 w-4" />
          {t('burnEvents.burn_and_claim', { count: selected.size })}
        </button>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
            {t('burnEvents.your_machines')}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : machines.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-dashed border-white/10 bg-slate-950/40 py-14 text-center text-slate-500">
            <Cpu className="mb-2 h-10 w-10 opacity-30" />
            <p className="text-sm">{t('burnEvents.no_machines')}</p>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {machines.map((m) => {
              const isSel = selected.has(m.id);
              const img = resolveAssetUrl(m.imageUrl);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-200 ${ isSel ? 'border-orange-500/25 bg-orange-500/15 shadow-lg shadow-orange-500/20' : 'border-white/10 bg-slate-950/50 hover:border-white/20 hover:bg-slate-900/70' }`}
                >
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${ isSel ? 'border-orange-400 bg-orange-500' : 'border-slate-600' }`}
                  >
                    {isSel ? <CheckCircle2 className="h-4 w-4 text-white" /> : null}
                  </div>
                  <BurnMachineThumb src={img} name={m.minerName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{m.minerName}</p>
                    <p className="text-[10px] text-slate-500">
                      {formatHashRate(m.hashRate)} ·{' '}
                      {m.location === 'RACK' ? t('burnEvents.loc_rack') : t('burnEvents.loc_inventory')}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {burning ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] border border-orange-500/30 bg-slate-950 p-6 shadow-2xl">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-orange-500/20 blur-3xl" />
            <div className="relative space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/20">
                  <Flame className="h-6 w-6 animate-pulse text-orange-400" />
                </div>
                <p className="text-lg font-black text-white">{t('burnEvents.burning_title')}</p>
              </div>
              <p className="text-sm text-slate-300">{t('burnEvents.burning_body')}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{t('burnEvents.burning_wait')}</span>
                  <span className="font-mono font-black text-orange-300">
                    {formatDurationClock(burnRemainingMs / 1000)}
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all"
                    style={{ width: `${burnProgressPct}%` }}
                  />
                </div>
              </div>
              {submitting || burnReady ? (
                <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('burnEvents.burning_finishing')}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {confirming && !burning ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !submitting && setConfirming(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-[2rem] border border-red-500/30 bg-slate-950 p-6 shadow-2xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/20">
                <Flame className="h-6 w-6 text-red-400" />
              </div>
              <p className="text-lg font-black text-white">{t('burnEvents.confirm_title')}</p>
            </div>
            <p className="text-sm text-slate-300">{t('burnEvents.confirm_body')}</p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-2xl border border-white/5 bg-slate-900/80 p-3">
              {selectedMachines.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-xs">
                  <span className="mr-2 truncate text-slate-300">{m.minerName}</span>
                  <span className="shrink-0 text-slate-500">{formatHashRate(m.hashRate)}</span>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs">
              <p className="font-bold text-emerald-400">{t('burnEvents.you_receive')}</p>
              <p className="mt-1 font-black text-white">{event.rewardMiner.name}</p>
              <p className="mt-0.5 text-slate-400">{t('burnEvents.goes_to_inbox')}</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-2xl border border-white/10 py-3 text-sm font-bold text-slate-300 transition-colors hover:bg-white/5"
              >
                {t('burnEvents.cancel')}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submit()}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500 py-3 text-sm font-black text-white transition-colors hover:bg-red-400 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
                {t('burnEvents.confirm_burn')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatBurnEventsLoadError(
  e: unknown,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const base = resolveApiErrorMessage(e, t('burnEvents.load_error'));
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
      <div className="p-4 sm:p-6">
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
    <div className="space-y-6 p-4 pb-20 sm:p-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-orange-500/20 bg-gradient-to-br from-orange-900/30 via-slate-900 to-slate-900 p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative z-10 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/15 shadow-lg shadow-orange-500/20">
            <Flame className="h-6 w-6 text-orange-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black tracking-tight text-white">{t('burnEvents.title')}</h1>
            <p className="mt-1 text-sm text-slate-400">{t('burnEvents.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl border border-white/10 bg-slate-900/60 p-2.5 text-slate-400 transition-colors hover:border-white/20 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        </div>
      ) : loadFailed ? (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-red-500/20 bg-red-950/20 py-16 text-center text-slate-400 gap-4 px-6">
          <p className="text-sm font-bold text-red-300/90">{t('burnEvents.load_error')}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2 text-xs font-bold text-white hover:border-white/20"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('common.retry')}
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 bg-slate-950/40 py-16 text-center text-slate-500">
          <Flame className="mb-3 h-12 w-12 opacity-30" />
          <p className="text-sm font-bold">{t('burnEvents.empty')}</p>
          <p className="mt-1 text-xs">{t('burnEvents.empty_hint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((e) => (
            <EventCard key={e.id} event={e} onOpen={() => setSelected(e)} />
          ))}
        </div>
      )}
    </div>
  );
}
