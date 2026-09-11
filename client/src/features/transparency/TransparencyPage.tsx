import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RTooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  Eye,
  DollarSign,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  ShieldCheck,
  BarChart2,
  Activity,
  AlertTriangle,
  Wallet,
  Info,
} from 'lucide-react';
import {
  CATEGORY_STYLE,
  CATEGORY_ORDER,
  toMonthly,
  toAnnual,
  fmt,
  CustomPieTooltip,
  CustomBarTooltip,
  PieLabel,
  StatCard,
  CategoryBar,
  IncomeCard,
  WalletsLiveSection,
  HardwareSection,
} from './components/transparency.shared';
import type { CategoryKey, TransparencyEntry, TransparencyApiResponse } from './components/transparency.shared';
import type { TrackedWalletEntry, WalletsLiveResponse } from './components/transparency.base';
import { walletTreasuryUsd } from './components/transparency.base';
import { WithdrawalsSection } from './components/transparency.withdrawals';
import { MethodologyModal } from './components/transparency.methodology';
import { useTranslation } from 'react-i18next';

export default function Transparency() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<TransparencyEntry[]>([]);
  const [wallets, setWallets] = useState<TrackedWalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/transparency').then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch('/api/transparency/wallets-live').then((r) => (r.ok ? r.json() : { ok: false })),
    ])
      .then(([entriesRaw, walletsRaw]: [unknown, WalletsLiveResponse]) => {
        if (cancelled) return;
        const d = entriesRaw as TransparencyApiResponse;
        if (d.ok) {
          setEntries(d.entries ?? []);
        } else setErr(t('transparency.loading_error'));
        if (walletsRaw.ok && walletsRaw.wallets) setWallets(walletsRaw.wallets);
      })
      .catch(() => {
        if (!cancelled) setErr(t('transparency.connection_error'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [t]);

  // ── Derived data ────────────────────────────────────────────────────────
  const expenses = entries.filter(e => !e.type || e.type === 'expense');
  const incomes  = entries.filter(e => e.type === 'income');

  const expRecurring    = expenses.filter(e => e.period !== 'one_time');
  const expOneTime      = expenses.filter(e => e.period === 'one_time');
  const totalMonthly    = expRecurring.reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0);
  const totalAnnual     = expRecurring.reduce((s, e) => s + toAnnual(e.amountUsd, e.period), 0)
                        + expOneTime.reduce((s, e) => s + parseFloat(String(e.amountUsd)), 0);
  const incRecurring    = incomes.filter(e => e.period !== 'one_time');
  const totalIncMonthly = incRecurring.reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0);
  const netBalance      = totalIncMonthly - totalMonthly;
  const netPositive     = netBalance >= 0;
  const paidUp          = expenses.filter(e => e.isPaid).length;
  const pending         = expenses.filter(e => !e.isPaid).length;

  const byCategory: Record<string, TransparencyEntry[]> = {};
  for (const e of expenses) {
    if (!byCategory[e.category]) byCategory[e.category] = [];
    byCategory[e.category].push(e);
  }

  const pieData = CATEGORY_ORDER
    .filter((c): c is CategoryKey => Boolean(byCategory[c]))
    .map(c => ({
      name: t(`transparency.category.${c}`, c),
      value: byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0),
      color: CATEGORY_STYLE[c]?.color || '#9ca3af',
    }))
    .filter(d => d.value > 0);

  const barData = CATEGORY_ORDER
    .filter((c): c is CategoryKey => Boolean(byCategory[c]))
    .map(c => ({
      cat: t(`transparency.category.${c}`, c).slice(0, 6),
      value: byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0),
      color: CATEGORY_STYLE[c]?.color || '#9ca3af',
    }))
    .filter(d => d.value > 0);

  const oneTimeTotal = expOneTime.reduce((s, e) => s + parseFloat(String(e.amountUsd)), 0);
  const treasuryTotal = wallets.reduce((sum, w) => sum + walletTreasuryUsd(w), 0);

  const entryUpdatedMs = entries.length > 0
    ? Math.max(...entries.map((e) => new Date(e.updatedAt).getTime()))
    : 0;
  const snapshotUpdatedMs = wallets.reduce((max, w) => {
    if (!w.fetchedAt) return max;
    return Math.max(max, new Date(w.fetchedAt).getTime());
  }, 0);
  const lastUpdatedMs = Math.max(entryUpdatedMs, snapshotUpdatedMs);
  const lastUpdated = lastUpdatedMs > 0
    ? new Date(lastUpdatedMs).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const lastOnChainSync = snapshotUpdatedMs > 0
    ? new Date(snapshotUpdatedMs).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="space-y-8 " data-testid="transparency-page">
      {/* ── Hero banner ───────────────────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden border border-white/8 bg-gradient-to-br from-slate-900 via-slate-900 to-primary/5 p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-lg shadow-primary/10">
                <Eye className="w-5 h-5 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white uppercase tracking-tight leading-none">
                  {t('transparency.page_title')}
                </h1>
                <p className="text-[11px] text-gray-500 mt-0.5">{t('transparency.page_subtitle')}</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 max-w-lg">{t('transparency.page_description')}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <div>
              <p className="text-xs font-black text-white">{t('transparency.badge_title')}</p>
              {lastUpdated && <p className="text-[10px] text-gray-600">{t('transparency.badge_updated', { date: lastUpdated })}</p>}
              {lastOnChainSync && (
                <p className="text-[10px] text-gray-600">{t('transparency.badge_onchain_sync', { date: lastOnChainSync })}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Loading spinner ───────────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center py-24" role="status" aria-label="Loading">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── API error ─────────────────────────────────────────────────── */}
      {err && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center text-red-400 text-sm flex items-center justify-center gap-2"
          data-testid="transparency-error"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {err}
        </div>
      )}

      {!loading && !err && (
        <>
          {/* ── KPI Cards ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4" data-testid="kpi-grid">
            <StatCard
              icon={DollarSign}
              label={t('transparency.kpi.monthly_cost')}
              value={fmt(totalMonthly, true)}
              sub={t('transparency.kpi.monthly_cost_sub')}
              accent="text-primary"
              glow
            />
            <StatCard
              icon={TrendingUp}
              label={t('transparency.kpi.total_income')}
              value={fmt(totalIncMonthly, true)}
              sub={t('transparency.kpi.total_income_sub')}
              accent="text-emerald-400"
            />
            <StatCard
              icon={Activity}
              label={t('transparency.kpi.net_balance')}
              value={fmt(Math.abs(netBalance), true)}
              sub={netPositive ? t('transparency.kpi.net_positive') : t('transparency.kpi.net_deficit')}
              accent={netPositive ? 'text-emerald-400' : 'text-red-400'}
            />
            <StatCard
              icon={CheckCircle2}
              label={t('transparency.kpi.annual_cost')}
              value={fmt(totalAnnual, true)}
              sub={t('transparency.kpi.annual_cost_sub', { paid: paidUp, pending })}
              accent="text-amber-400"
            />
            <StatCard
              icon={Wallet}
              label={t('transparency.kpi.treasury')}
              value={fmt(treasuryTotal, true)}
              sub={t('transparency.kpi.treasury_sub')}
              accent="text-violet-400"
            />
          </div>

          {totalMonthly === 0 && oneTimeTotal > 0 && (
            <div
              className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3 text-sm text-amber-200/90"
              data-testid="one-time-callout"
            >
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <p>{t('transparency.callout.one_time_only', { total: fmt(oneTimeTotal) })}</p>
            </div>
          )}

          {/* ── Recharts: Donut + Bar ──────────────────────────────────── */}
          {pieData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Donut */}
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" aria-hidden="true" />
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                    {t('transparency.charts.monthly_distribution')}
                  </p>
                </div>
                <div className="flex items-center gap-6 flex-wrap">
                  <div style={{ width: 200, height: 180, flexShrink: 0 }} aria-hidden="true">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} dataKey="value" labelLine={false} label={PieLabel}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} strokeWidth={0} />)}
                        </Pie>
                        <RTooltip content={CustomPieTooltip} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col gap-2 text-xs flex-1">
                    {pieData.map((d, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} aria-hidden="true" />
                        <span className="text-gray-400">{d.name}</span>
                        <span className="text-white font-black ml-auto">{fmt(d.value, true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bar */}
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" aria-hidden="true" />
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                    {t('transparency.charts.cost_by_category')}
                  </p>
                </div>
                <div aria-hidden="true">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={barData} barSize={28} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis dataKey="cat" tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v, true)} />
                      <RTooltip content={CustomBarTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ── Horizontal category bars ───────────────────────────────── */}
          {Object.keys(byCategory).length > 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-5">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-primary" aria-hidden="true" />
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">
                  {t('transparency.charts.weight_by_category')}
                </p>
                <span className="ml-auto text-[10px] text-gray-600">
                  {t('transparency.charts.total_monthly', { total: fmt(totalMonthly) })}
                </span>
              </div>
              <div className="space-y-4">
                {CATEGORY_ORDER.filter((c): c is CategoryKey => Boolean(byCategory[c])).map((c) => (
                  <CategoryBar
                    key={c}
                    catKey={c}
                    monthly={byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0)}
                    totalMonthly={totalMonthly}
                    count={byCategory[c].length}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Income / Revenue / Sponsorships ───────────────────────── */}
          {incomes.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/10 overflow-hidden" data-testid="income-section">
              <div className="px-6 py-4 border-b border-emerald-500/10 bg-emerald-500/5 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                <p className="text-xs font-black text-emerald-400 uppercase tracking-widest">
                  {t('transparency.income_section.title')}
                </p>
                <span className="ml-auto text-xs font-black text-emerald-300">
                  {fmt(totalIncMonthly, true)}<span className="text-gray-600 font-normal">{t('transparency.income_section.per_month')}</span>
                </span>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {incomes.map(e => <IncomeCard key={e.id} entry={e} />)}
                </div>
              </div>
            </div>
          )}

          <WithdrawalsSection />

          {/* ── Project wallets (on-chain live data) ──────────────────── */}
          <WalletsLiveSection />

          <HardwareSection />

          <div className="text-center pb-4 space-y-2">
            <p className="text-[11px] text-gray-600">{t('transparency.footer_note')}</p>
            <button
              type="button"
              onClick={() => setMethodologyOpen(true)}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"
            >
              <Info className="w-3.5 h-3.5" aria-hidden="true" />
              {t('transparency.methodology.link')}
            </button>
          </div>

          <MethodologyModal open={methodologyOpen} onClose={() => setMethodologyOpen(false)} />
        </>
      )}
    </div>
  );
}
