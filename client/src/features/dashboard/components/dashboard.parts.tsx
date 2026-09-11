import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Banknote,
  Check,
  ChevronDown,
  Clock,
  Coins,
  Gauge,
  Pickaxe,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { DashboardBlockRow, DashboardMinerStats, DashboardCycleState } from '../lib/dashboard.types';
import { safeDashboardNumber, Card, formatDashboardBlockTime } from './dashboard.shared';
import {
  DASHBOARD_BALANCE_CURRENCIES,
  DASHBOARD_BALANCE_CURRENCY_META,
  type DashboardBalanceCurrency,
  type DashboardWalletBalances,
  emptyDashboardWalletBalances,
} from '../lib/dashboardBalanceCurrency';

export type DashboardCardsProps = {
  miner: DashboardMinerStats | undefined;
  cycle: DashboardCycleState | null;
  blkBalance: number | null;
  walletBalances?: DashboardWalletBalances;
  balanceCurrency: DashboardBalanceCurrency;
  onBalanceCurrencyChange: (currency: DashboardBalanceCurrency) => void;
  speedVal: string;
  speedUnit: string;
  netVal: string;
  netUnit: string;
  /** Cosmetic, flows continuously toward this block's expected payout — see DashboardPage.tsx. */
  pendingPol?: number;
  /** Smoothed countdown (blockAnchorRef + liveClockMs in DashboardPage.tsx) — replaces raw
   *  cycle.blockCountdownSeconds, which only updates once per 15s REST poll. */
  countdownSeconds?: number;
  /** Decimal places sized so the balance card's last visible digit changes every 1s tick —
   *  see DashboardPage.tsx (a fixed decimal count made the low digits look frozen). */
  balanceDecimals?: number;
};

function CurrencyLogo({
  url,
  symbol,
  className = 'w-5 h-5',
}: {
  url: string | null;
  symbol: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        className={`${className} rounded-full object-contain shrink-0`}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className={`${className} inline-flex items-center justify-center rounded-full bg-slate-800 text-[9px] font-black text-slate-300 shrink-0`}
    >
      {symbol.slice(0, 1)}
    </span>
  );
}

function BalanceCurrencyPicker({
  selected,
  balances,
  onChange,
}: {
  selected: DashboardBalanceCurrency;
  balances: DashboardWalletBalances;
  onChange: (c: DashboardBalanceCurrency) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const MENU_W = 240;

  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const left = Math.min(
        Math.max(8, r.right - MENU_W),
        window.innerWidth - MENU_W - 8,
      );
      const below = r.bottom + 6;
      const menuH = menuRef.current?.offsetHeight ?? 180;
      const top =
        below + menuH > window.innerHeight - 8
          ? Math.max(8, r.top - menuH - 6)
          : below;
      setMenuPos({ top, left });
    };
    place();
    // Re-measure after first paint so menuH is accurate.
    requestAnimationFrame(place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const meta = DASHBOARD_BALANCE_CURRENCY_META[selected];

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ top: menuPos.top, left: menuPos.left, width: MENU_W }}
            className="fixed z-[200] rounded-2xl border border-gray-700 bg-slate-950 shadow-2xl overflow-hidden"
          >
            <p className="px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-gray-800">
              {t('dashboard.balance_currency_pick')}
            </p>
            <ul className="max-h-72 overflow-y-auto py-1.5">
              {DASHBOARD_BALANCE_CURRENCIES.map((symbol) => {
                const m = DASHBOARD_BALANCE_CURRENCY_META[symbol];
                const amount = balances[symbol] ?? 0;
                const active = symbol === selected;
                return (
                  <li key={symbol}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onChange(symbol);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors ${
                        active ? 'bg-primary/15 text-white' : 'hover:bg-slate-900 text-slate-300'
                      }`}
                    >
                      <CurrencyLogo url={m.logoUrl} symbol={symbol} className="w-8 h-8" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black truncate">{t(m.nameKey)}</p>
                        <p className="text-xs text-slate-500 tabular-nums">
                          {safeDashboardNumber(amount, m.decimals)} {symbol}
                        </p>
                      </div>
                      {active ? <Check className="w-4 h-4 text-primary shrink-0" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative z-20 shrink-0" ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700/70 bg-gray-900/90 px-2.5 py-1.5 text-xs sm:text-sm font-black uppercase tracking-wider text-gray-200 hover:border-primary/50 hover:text-white transition-colors shadow-sm"
        title={t('dashboard.balance_currency_pick')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CurrencyLogo url={meta.logoUrl} symbol={meta.symbol} className="w-5 h-5 sm:w-6 sm:h-6" />
        {selected}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </div>
  );
}

export function DashboardCards({
  miner: _miner,
  cycle,
  blkBalance,
  walletBalances,
  balanceCurrency,
  onBalanceCurrencyChange,
  speedVal,
  speedUnit,
  netVal,
  netUnit,
  pendingPol,
  countdownSeconds,
  balanceDecimals,
}: DashboardCardsProps) {
  const { t } = useTranslation();
  const balances = walletBalances ?? emptyDashboardWalletBalances();
  const meta = DASHBOARD_BALANCE_CURRENCY_META[balanceCurrency];

  let displayAmount = balances[balanceCurrency] ?? 0;
  let decimals = meta.decimals;
  if (balanceCurrency === 'POL') {
    // Wallet POL is the stable source of truth; miner.balance can lag/jump every
    // /mining/cycle poll and made the card flicker between two values.
    const walletPol = Number(balances.POL);
    const base = Number.isFinite(walletPol) ? walletPol : 0;
    displayAmount = base + (pendingPol ?? 0);
    decimals = balanceDecimals ?? meta.decimals;
  } else if (balanceCurrency === 'BLK') {
    const walletBlk = blkBalance != null ? Number(blkBalance) : Number(balances.BLK);
    displayAmount = Number.isFinite(walletBlk) ? walletBlk : 0;
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 md:gap-6">
      <Card
        icon={Coins}
        logoUrl={meta.logoUrl}
        label={t('dashboard.balance')}
        value={safeDashboardNumber(displayAmount, decimals)}
        unit={balanceCurrency}
        color="blue"
        headerExtra={
          <BalanceCurrencyPicker
            selected={balanceCurrency}
            balances={{
              ...balances,
              POL: (Number.isFinite(Number(balances.POL)) ? Number(balances.POL) : 0) + (pendingPol ?? 0),
              BLK: blkBalance != null ? blkBalance : balances.BLK,
            }}
            onChange={onBalanceCurrencyChange}
          />
        }
      />
      <Card
        icon={Banknote}
        label={t('dashboard.balance_blk_label')}
        value={blkBalance != null ? safeDashboardNumber(blkBalance, 4) : '—'}
        unit="BLK"
        color="cyan"
      />
      <Card icon={Pickaxe} label={t('dashboard.speed')} value={speedVal} unit={speedUnit} color="purple" />
      <Card icon={Zap} label={t('dashboard.network_power')} value={netVal} unit={netUnit} color="amber" />
      <Card
        icon={Clock}
        label={t('dashboard.next_block')}
        value={safeDashboardNumber(countdownSeconds ?? cycle?.blockCountdownSeconds ?? 0, 0)}
        unit={t('dashboard.seconds_short')}
        color="emerald"
      />
    </div>
  );
}

export type DashboardHistoryProps = {
  blockHistory: DashboardBlockRow[];
  tokenSymbol?: string;
};

// Deviation from legacy: legacy rendered a Recharts <EarningsSparkline> above
// the block-history table (AreaChart of the last 12 rewards). current/client
// does not have `recharts` as a dependency (checked current/client/package.json)
// and this port must not add a new runtime dependency without an install step
// the task explicitly said not to run. The sparkline is dropped; the table
// below carries the same data. Re-add the chart once recharts is installed.
export function DashboardHistory({ blockHistory, tokenSymbol }: DashboardHistoryProps) {
  const { t } = useTranslation();
  const rows = blockHistory.slice(0, 5);

  return (
    <div className="bg-surface border border-gray-800/50 rounded-3xl overflow-hidden shadow-xl">
      <div className="px-4 sm:px-6 md:px-8 py-4 sm:py-6 border-b border-gray-800/50 flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center bg-gray-800/20">
        <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 sm:gap-3 min-w-0">
          <Activity className="w-5 h-5 text-primary shrink-0" />
          <span className="truncate">{t('dashboard.history_title')}</span>
        </h2>
        <span className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-widest pl-7 sm:pl-0">
          {t('dashboard.last_blocks')}
        </span>
      </div>

      {/* Mobile: stacked cards — table is unreadable under ~md */}
      <div className="md:hidden divide-y divide-gray-800/50">
        {rows.map((block) => (
          <div key={String(block.blockNumber)} className="px-4 py-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="bg-gray-800/50 px-2.5 py-1 rounded-lg text-xs font-bold text-white">
                #{Number(block.blockNumber)}
              </span>
              <span className="text-gray-500 font-mono text-[11px] tabular-nums">{formatDashboardBlockTime(block)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{t('dashboard.my_gain')}</p>
                <div className="flex items-start gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="text-emerald-400 font-black text-xs break-all">
                      +{safeDashboardNumber(block.userReward, 8)}{' '}
                      <span className="text-[10px] font-normal">{tokenSymbol}</span>
                    </span>
                    {Number(block.userRewardShib ?? 0) > 0 && (
                      <span className="text-amber-300 font-black text-[11px]">
                        +{safeDashboardNumber(block.userRewardShib, 2)} SHIB
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{t('dashboard.block_total')}</p>
                <div className="flex flex-col leading-tight text-gray-300 font-bold">
                  <span className="text-xs break-all inline-flex items-center gap-1.5 flex-wrap">
                    {safeDashboardNumber(block.totalReward, 8)} {tokenSymbol}
                    {block.persistFailed ? (
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider text-amber-400/90"
                        title={t('dashboard.persist_failed_title')}
                      >
                        DB
                      </span>
                    ) : null}
                  </span>
                  {Number(block.totalRewardShib ?? 0) > 0 && (
                    <span className="text-amber-300/80 text-[11px] font-bold">
                      {safeDashboardNumber(block.totalRewardShib, 2)} SHIB
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="px-4 py-10 text-center text-gray-500 font-medium italic text-sm">{t('dashboard.no_blocks')}</p>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-400">
          <thead className="bg-gray-800/30 text-[10px] uppercase font-bold tracking-widest text-gray-500">
            <tr>
              <th className="px-6 md:px-8 py-4">{t('dashboard.block_id')}</th>
              <th className="px-6 md:px-8 py-4">{t('dashboard.my_gain')}</th>
              <th className="px-6 md:px-8 py-4">{t('dashboard.block_total')}</th>
              <th className="px-6 md:px-8 py-4 text-right">{t('dashboard.time')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50 font-medium">
            {rows.map((block) => (
              <tr key={String(block.blockNumber)} className="hover:bg-primary/5 transition-colors group">
                <td className="px-6 md:px-8 py-5">
                  <span className="bg-gray-800/50 px-3 py-1 rounded-lg text-xs font-bold text-white group-hover:text-primary transition-colors">
                    #{Number(block.blockNumber)}
                  </span>
                </td>
                <td className="px-6 md:px-8 py-5">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5" />
                    <div className="flex flex-col leading-tight">
                      <span className="text-emerald-400 font-black">
                        +{safeDashboardNumber(block.userReward, 8)}{' '}
                        <span className="text-[10px] font-normal">{tokenSymbol}</span>
                      </span>
                      {Number(block.userRewardShib ?? 0) > 0 && (
                        <span className="text-amber-300 font-black text-[11px]">
                          +{safeDashboardNumber(block.userRewardShib, 2)}{' '}
                          <span className="text-[9px] font-normal">SHIB</span>
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 md:px-8 py-5 text-gray-300 font-bold">
                  <div className="flex flex-col leading-tight">
                    <span className="inline-flex items-center gap-2">
                      {safeDashboardNumber(block.totalReward, 8)} {tokenSymbol}
                      {block.persistFailed ? (
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider text-amber-400/90"
                          title={t('dashboard.persist_failed_title')}
                        >
                          DB
                        </span>
                      ) : null}
                    </span>
                    {Number(block.totalRewardShib ?? 0) > 0 && (
                      <span className="text-amber-300/80 text-[11px] font-bold">
                        {safeDashboardNumber(block.totalRewardShib, 2)} SHIB
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 md:px-8 py-5 text-right text-gray-500 font-mono text-xs">{formatDashboardBlockTime(block)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 md:px-8 py-12 text-center text-gray-500 font-medium italic">
                  {t('dashboard.no_blocks')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type DashboardEfficiencyCardProps = {
  freeRacks: number | null;
  inventoryCount: number | null;
  loading: boolean;
};

/** Points the user at the highest-impact next action: install idle inventory, or expand capacity. */
export function DashboardEfficiencyCard({ freeRacks, inventoryCount, loading }: DashboardEfficiencyCardProps) {
  const { t } = useTranslation();
  const freeRacksCount = freeRacks ?? 0;
  const inventoryItemsCount = inventoryCount ?? 0;
  const hasFreeRacks = freeRacksCount > 0;
  const hasIdleInventory = inventoryItemsCount > 0;

  let message = t('dashboard.efficiency_all_full');
  let ctaLabel = t('dashboard.efficiency_cta_machines');
  let ctaTo = '/inventory';
  if (hasFreeRacks && hasIdleInventory) {
    message = t('dashboard.efficiency_idle_inventory', { count: inventoryItemsCount, free: freeRacksCount });
    ctaLabel = t('dashboard.efficiency_cta_install');
    ctaTo = '/inventory';
  } else if (hasFreeRacks) {
    message = t('dashboard.efficiency_free_racks', { free: freeRacksCount });
    ctaLabel = t('dashboard.efficiency_cta_shop');
    ctaTo = '/shop';
  }

  return (
    <div className="bg-surface border border-gray-800/50 rounded-3xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-sky-500/10 rounded-xl">
          <Gauge className="w-5 h-5 text-sky-400" />
        </div>
        <h3 className="text-sm font-black text-white uppercase tracking-widest">{t('dashboard.efficiency_title')}</h3>
      </div>
      {loading ? (
        <div className="h-16 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-sky-400/40 border-t-sky-400 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <p className="text-sm text-gray-400 leading-relaxed mb-4">{message}</p>
          <Link
            to={ctaTo}
            className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-sky-500/10 border border-sky-500/25 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-sky-300 transition-colors hover:bg-sky-500/20"
          >
            {ctaLabel}
          </Link>
        </>
      )}
    </div>
  );
}

export type DashboardActivityCardProps = {
  completionsToday: number | null;
  requiredForWaiver: number | null;
  feeWaived: boolean;
  feeAlreadyChargedToday: boolean;
  loading: boolean;
};

/** Progress toward today's withdrawal-fee waiver (offerwall/faucet/shortlink/YouTube/games).
 *  Hidden once a withdrawal already got charged the fee today — that request is already
 *  settled, so nudging toward "more activities" would be moot noise for the rest of today. */
export function DashboardActivityCard({
  completionsToday,
  requiredForWaiver,
  feeWaived,
  feeAlreadyChargedToday,
  loading,
}: DashboardActivityCardProps) {
  const { t } = useTranslation();
  if (!loading && feeAlreadyChargedToday && !feeWaived) return null;

  const done = completionsToday ?? 0;
  const required = requiredForWaiver ?? 10;
  const pct = Math.min(100, Math.round((done / required) * 100));

  return (
    <div className="bg-surface border border-gray-800/50 rounded-3xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-emerald-500/10 rounded-xl">
          <Sparkles className="w-5 h-5 text-emerald-400" />
        </div>
        <h3 className="text-sm font-black text-white uppercase tracking-widest">{t('dashboard.activity_title')}</h3>
      </div>
      {loading ? (
        <div className="h-16 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-emerald-400/40 border-t-emerald-400 rounded-full animate-spin" />
        </div>
      ) : feeWaived ? (
        <p className="text-sm text-emerald-400 font-bold leading-relaxed">{t('dashboard.activity_waived')}</p>
      ) : (
        <>
          <p className="text-sm text-gray-400 leading-relaxed mb-3">
            {t('dashboard.activity_progress', { done, required })}
          </p>
          <div className="h-2 w-full rounded-full bg-gray-800 overflow-hidden mb-4">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <Link
            to="/offerwall"
            className="inline-flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/20"
          >
            {t('dashboard.activity_cta')}
          </Link>
        </>
      )}
    </div>
  );
}
