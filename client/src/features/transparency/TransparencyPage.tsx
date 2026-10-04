import { useEffect, useState, useRef } from 'react';
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
  Receipt,
  LayoutGrid,
  Cpu,
  ArrowUpRight,
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
  EntryRow,
  WalletsLiveSection,
  HardwareSection,
  AiInfrastructure3DSection,
} from './components/transparency.shared';
import type { CategoryKey, TransparencyEntry, TransparencyApiResponse } from './components/transparency.shared';
import type { TrackedWalletEntry, WalletsLiveResponse } from './components/transparency.base';
import { walletTreasuryUsd } from './components/transparency.base';
import { WithdrawalsSection } from './components/transparency.withdrawals';
import { MethodologyModal } from './components/transparency.methodology';
import { useTranslation } from 'react-i18next';

export type TransparencyTab = 'all' | 'overview' | 'expenses' | 'treasury' | 'infrastructure' | 'withdrawals';

export default function Transparency() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<TransparencyEntry[]>([]);
  const [wallets, setWallets] = useState<TrackedWalletEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TransparencyTab>('all');
  const tabListRef = useRef<HTMLDivElement>(null);

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
    return () => {
      cancelled = true;
    };
  }, [t]);

  // ── Derived financial data (strictly calculated on client from server payloads) ──
  const expenses = entries.filter((e) => !e.type || e.type === 'expense');
  const incomes = entries.filter((e) => e.type === 'income');

  const expRecurring = expenses.filter((e) => e.period !== 'one_time');
  const expOneTime = expenses.filter((e) => e.period === 'one_time');
  const totalMonthly = expRecurring.reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0);
  const totalAnnual =
    expRecurring.reduce((s, e) => s + toAnnual(e.amountUsd, e.period), 0) +
    expOneTime.reduce((s, e) => s + parseFloat(String(e.amountUsd)), 0);
  const incRecurring = incomes.filter((e) => e.period !== 'one_time');
  const totalIncMonthly = incRecurring.reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0);
  const netBalance = totalIncMonthly - totalMonthly;
  const netPositive = netBalance >= 0;
  const paidUp = expenses.filter((e) => e.isPaid).length;
  const pending = expenses.filter((e) => !e.isPaid).length;

  const byCategory: Record<string, TransparencyEntry[]> = {};
  for (const e of expenses) {
    if (!byCategory[e.category]) byCategory[e.category] = [];
    byCategory[e.category].push(e);
  }

  const pieData = CATEGORY_ORDER
    .filter((c): c is CategoryKey => Boolean(byCategory[c]))
    .map((c) => ({
      name: t(`transparency.category.${c}`, c),
      value: byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0),
      color: CATEGORY_STYLE[c]?.color || '#9ca3af',
    }))
    .filter((d) => d.value > 0);

  const barData = CATEGORY_ORDER
    .filter((c): c is CategoryKey => Boolean(byCategory[c]))
    .map((c) => ({
      cat: t(`transparency.category.${c}`, c).slice(0, 6),
      value: byCategory[c].reduce((s, e) => s + toMonthly(e.amountUsd, e.period), 0),
      color: CATEGORY_STYLE[c]?.color || '#9ca3af',
    }))
    .filter((d) => d.value > 0);

  const oneTimeTotal = expOneTime.reduce((s, e) => s + parseFloat(String(e.amountUsd)), 0);
  const treasuryTotal = wallets.reduce((sum, w) => sum + walletTreasuryUsd(w), 0);

  const entryUpdatedMs = entries.length > 0 ? Math.max(...entries.map((e) => new Date(e.updatedAt).getTime())) : 0;
  const snapshotUpdatedMs = wallets.reduce((max, w) => {
    if (!w.fetchedAt) return max;
    return Math.max(max, new Date(w.fetchedAt).getTime());
  }, 0);
  const lastUpdatedMs = Math.max(entryUpdatedMs, snapshotUpdatedMs);
  const lastUpdated =
    lastUpdatedMs > 0
      ? new Date(lastUpdatedMs).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
      : null;
  const lastOnChainSync =
    snapshotUpdatedMs > 0
      ? new Date(snapshotUpdatedMs).toLocaleString(undefined, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  // ── Keyboard accessibility for tablist ──
  const tabsList: { key: TransparencyTab; label: string; icon: typeof LayoutGrid }[] = [
    { key: 'all', label: t('transparency.nav.all', 'Todos os Dados'), icon: LayoutGrid },
    { key: 'overview', label: t('transparency.nav.overview', 'Visão Geral & Gráficos'), icon: BarChart2 },
    { key: 'expenses', label: t('transparency.nav.financials', 'Custos & Receitas'), icon: Receipt },
    { key: 'treasury', label: t('transparency.nav.treasury', 'Tesouraria & Carteiras'), icon: Wallet },
    { key: 'infrastructure', label: t('transparency.nav.infrastructure', 'Hardware & IA 3D'), icon: Cpu },
    { key: 'withdrawals', label: t('transparency.nav.withdrawals', 'Saques'), icon: ArrowUpRight },
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = currentIndex;
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabsList.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabsList.length) % tabsList.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabsList.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    setActiveTab(tabsList[nextIndex].key);
    const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    if (buttons && buttons[nextIndex]) {
      buttons[nextIndex].focus();
    }
  };

  return (
    <div className="space-y-8 pb-12" data-testid="transparency-page">
      {/* ── Hero Banner: High contrast, transparent & audited badge ──────────────── */}
      <section
        aria-labelledby="transparency-hero-title"
        className="relative rounded-3xl overflow-hidden border-2 border-slate-800 bg-gradient-to-br from-[#0c1220] via-slate-900 to-[#101b33] p-6 sm:p-8 shadow-[0_0_35px_rgba(59,130,246,0.1),6px_6px_0px_#000000]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.15),transparent_60%)] pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/15 border-2 border-primary/30 flex items-center justify-center shadow-[3px_3px_0px_#000000] shrink-0">
                <Eye className="w-6 h-6 text-primary drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" aria-hidden="true" />
              </div>
              <div>
                <h1 id="transparency-hero-title" className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight leading-none">
                  {t('transparency.page_title')}
                </h1>
                <p className="text-xs text-primary/80 font-bold uppercase tracking-wider mt-1">{t('transparency.page_subtitle')}</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed">{t('transparency.page_description')}</p>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2.5 shrink-0">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 border-emerald-500/30 bg-emerald-950/30 shadow-[2px_2px_0px_#000000]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              <span className="text-xs font-black text-emerald-300 tracking-wider uppercase">{t('transparency.badge_title')}</span>
            </div>
            <div className="text-[11px] text-slate-400 space-y-0.5 md:text-right">
              {lastUpdated && <p>{t('transparency.badge_updated', { date: lastUpdated })}</p>}
              {lastOnChainSync && (
                <p className="text-slate-400/80">{t('transparency.badge_onchain_sync', { date: lastOnChainSync })}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Loading Spinner ───────────────────────────────────────────── */}
      {loading && (
        <div className="flex justify-center py-24" role="status" aria-label="Loading">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin shadow-lg" />
        </div>
      )}

      {/* ── API Error Alert ───────────────────────────────────────────── */}
      {err && (
        <div
          role="alert"
          className="rounded-2xl border-2 border-red-500/30 bg-red-950/20 p-6 text-center text-red-300 text-sm flex items-center justify-center gap-2.5 shadow-[4px_4px_0px_#000000]"
          data-testid="transparency-error"
        >
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" aria-hidden="true" />
          <span className="font-semibold">{err}</span>
        </div>
      )}

      {!loading && !err && (
        <>
          {/* ── Primary KPI Summary: Balanced responsive grid (P3 fixed) ──── */}
          <section aria-label="Indicadores Financeiros Principais">
            <h2 className="sr-only">Resumo de Indicadores Financeiros</h2>
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
              data-testid="kpi-grid"
            >
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
              <div className="sm:col-span-2 lg:col-span-1 xl:col-span-1">
                <StatCard
                  icon={Wallet}
                  label={t('transparency.kpi.treasury')}
                  value={fmt(treasuryTotal, true)}
                  sub={t('transparency.kpi.treasury_sub')}
                  accent="text-violet-400"
                />
              </div>
            </div>
          </section>

          {totalMonthly === 0 && oneTimeTotal > 0 && (
            <div
              className="rounded-2xl border-2 border-amber-500/30 bg-amber-950/20 px-4 py-3 flex items-start gap-3 text-sm text-amber-200 shadow-[3px_3px_0px_#000000]"
              data-testid="one-time-callout"
            >
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="leading-snug">{t('transparency.callout.one_time_only', { total: fmt(oneTimeTotal) })}</p>
            </div>
          )}

          {/* ── P2: Intuitive Sub-Navigation Hub (Sticky Tab Bar) ─────────── */}
          <nav
            aria-label="Navegação de Transparência"
            className="sticky top-14 md:top-20 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-3 bg-[#020617]/90 backdrop-blur-md border-y border-slate-800 shadow-md"
          >
            <div
              ref={tabListRef}
              role="tablist"
              aria-label="Seções do Portal de Transparência"
              className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth"
            >
              {tabsList.map((tab, idx) => {
                const Icon = tab.icon;
                const isSelected = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    id={`tab-${tab.key}`}
                    aria-selected={isSelected}
                    aria-controls={`panel-${tab.key}`}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => setActiveTab(tab.key)}
                    onKeyDown={(e) => handleTabKeyDown(e, idx)}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all border-2 select-none outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      isSelected
                        ? 'border-primary bg-primary/20 text-white shadow-[2px_2px_0px_#000000] translate-y-[-1px]'
                        : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:border-slate-700 active:translate-y-0.5'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : 'text-slate-400'}`} aria-hidden="true" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* ── Section Content Panels ────────────────────────────────────── */}

          {/* 1. VISÃO GERAL: Gráficos Recharts (Donut + Bar) & Categorias ── */}
          {(activeTab === 'all' || activeTab === 'overview') && (
            <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="space-y-6">
              {pieData.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Donut Chart Card */}
                  <section
                    aria-labelledby="overview-donut-title"
                    className="rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-5 sm:p-6 space-y-4 shadow-[4px_4px_0px_#000000]"
                  >
                    <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800/80">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shadow-[2px_2px_0px_#000000]">
                        <BarChart2 className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <h2 id="overview-donut-title" className="text-xs font-black text-slate-300 uppercase tracking-widest">
                        {t('transparency.charts.monthly_distribution')}
                      </h2>
                    </div>

                    <div className="flex items-center gap-6 flex-wrap">
                      <div style={{ width: 200, height: 180, flexShrink: 0 }} aria-hidden="true">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={52}
                              outerRadius={80}
                              paddingAngle={3}
                              dataKey="value"
                              labelLine={false}
                              label={PieLabel}
                            >
                              {pieData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} strokeWidth={0} />
                              ))}
                            </Pie>
                            <RTooltip content={CustomPieTooltip} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Accessible textual breakdown alongside chart */}
                      <ul aria-label="Valores da Distribuição Mensal" className="flex flex-col gap-2 text-xs flex-1 list-none p-0 m-0">
                        {pieData.map((d, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-[1px_1px_0px_#000000]" style={{ background: d.color }} aria-hidden="true" />
                            <span className="text-slate-400 font-medium">{d.name}</span>
                            <span className="text-white font-black ml-auto font-mono">{fmt(d.value, true)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </section>

                  {/* Bar Chart Card */}
                  <section
                    aria-labelledby="overview-bar-title"
                    className="rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-5 sm:p-6 space-y-4 shadow-[4px_4px_0px_#000000]"
                  >
                    <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800/80">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shadow-[2px_2px_0px_#000000]">
                        <Activity className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <h2 id="overview-bar-title" className="text-xs font-black text-slate-300 uppercase tracking-widest">
                        {t('transparency.charts.cost_by_category')}
                      </h2>
                    </div>

                    <div aria-hidden="true">
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={barData} barSize={28} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                          <XAxis dataKey="cat" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v, true)} />
                          <RTooltip content={CustomBarTooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                            {barData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                </div>
              )}

              {/* Horizontal Category Weight Bars */}
              {Object.keys(byCategory).length > 0 && (
                <section
                  aria-labelledby="overview-weights-title"
                  className="rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-5 sm:p-6 space-y-4 shadow-[4px_4px_0px_#000000]"
                >
                  <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800/80 flex-wrap">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shadow-[2px_2px_0px_#000000]">
                      <TrendingDown className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <h2 id="overview-weights-title" className="text-xs font-black text-slate-300 uppercase tracking-widest">
                      {t('transparency.charts.weight_by_category')}
                    </h2>
                    <span className="ml-auto text-xs font-mono font-bold text-slate-400">
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
                </section>
              )}
            </div>
          )}

          {/* 2. CUSTOS E RECEITAS: Tabela Detalhada & Cards de Entrada ─────── */}
          {(activeTab === 'all' || activeTab === 'expenses') && (
            <div id="panel-expenses" role="tabpanel" aria-labelledby="tab-expenses" className="space-y-6">
              {/* Expense Breakdown Table (Solving P4: I18n Table Headers) */}
              {expenses.length > 0 && (
                <section
                  aria-labelledby="expenses-table-title"
                  className="rounded-3xl border-2 border-slate-800 bg-slate-900/60 overflow-hidden shadow-[4px_4px_0px_#000000]"
                  data-testid="expenses-table-section"
                >
                  <div className="px-5 sm:px-6 py-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[2px_2px_0px_#000000]">
                        <Receipt className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <h2 id="expenses-table-title" className="text-xs font-black text-slate-200 uppercase tracking-wider">
                        {t('transparency.table.title')}
                      </h2>
                    </div>
                    <span className="text-xs font-mono font-bold text-slate-300 px-2.5 py-1 rounded-full border border-slate-700 bg-slate-950 shadow-[1px_1px_0px_#000000]">
                      {t('transparency.table.items_count', { count: expenses.length })}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 bg-slate-950/60 text-[10px] uppercase font-black text-slate-400 tracking-wider">
                        <tr>
                          <th scope="col" className="py-3 px-4 sm:px-6">
                            {t('transparency.table.col_name')}
                          </th>
                          <th scope="col" className="py-3 px-4 hidden md:table-cell">
                            {t('transparency.table.col_provider')}
                          </th>
                          <th scope="col" className="py-3 px-4 text-right">
                            {t('transparency.table.col_amount')}
                          </th>
                          <th scope="col" className="py-3 px-4 text-right sm:pr-6">
                            {t('transparency.table.col_status')}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {expenses.map((e) => (
                          <EntryRow key={e.id} entry={e} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Income / Revenue / Sponsorships */}
              {incomes.length > 0 && (
                <section
                  aria-labelledby="income-section-title"
                  className="rounded-3xl border-2 border-emerald-500/30 bg-emerald-950/15 overflow-hidden shadow-[4px_4px_0px_#000000]"
                  data-testid="income-section"
                >
                  <div className="px-5 sm:px-6 py-4 border-b border-emerald-500/20 bg-emerald-950/30 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[2px_2px_0px_#000000]">
                        <TrendingUp className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <h2 id="income-section-title" className="text-xs font-black text-emerald-300 uppercase tracking-widest">
                        {t('transparency.income_section.title')}
                      </h2>
                    </div>
                    <span className="text-xs font-mono font-black text-emerald-400 bg-emerald-950/60 px-3 py-1 rounded-full border border-emerald-500/30">
                      {fmt(totalIncMonthly, true)}
                      <span className="text-emerald-500 font-normal ml-0.5">{t('transparency.income_section.per_month')}</span>
                    </span>
                  </div>
                  <div className="p-4 sm:p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {incomes.map((e) => (
                        <IncomeCard key={e.id} entry={e} />
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* 3. TESOURARIA E CARTEIRAS: On-Chain Live Feed ─────────────────── */}
          {(activeTab === 'all' || activeTab === 'treasury') && (
            <div id="panel-treasury" role="tabpanel" aria-labelledby="tab-treasury">
              <WalletsLiveSection />
            </div>
          )}

          {/* 4. INFRAESTRUTURA 3D: Servidores IA & Hardware ASIC ──────────── */}
          {(activeTab === 'all' || activeTab === 'infrastructure') && (
            <div id="panel-infrastructure" role="tabpanel" aria-labelledby="tab-infrastructure" className="space-y-6">
              <AiInfrastructure3DSection />
              <HardwareSection />
            </div>
          )}

          {/* 5. SAQUES COMPROVADOS: Métricas On-chain de Retiradas ─────────── */}
          {(activeTab === 'all' || activeTab === 'withdrawals') && (
            <div id="panel-withdrawals" role="tabpanel" aria-labelledby="tab-withdrawals">
              <WithdrawalsSection />
            </div>
          )}

          {/* ── Footer note & Methodology modal trigger ──────────────────── */}
          <footer className="text-center pt-4 pb-2 space-y-2">
            <p className="text-[11px] text-slate-500">{t('transparency.footer_note')}</p>
            <button
              type="button"
              onClick={() => setMethodologyOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors py-1 px-3 rounded-lg border border-primary/20 bg-primary/5 hover:bg-primary/10 shadow-[2px_2px_0px_#000000]"
            >
              <Info className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('transparency.methodology.link')}</span>
            </button>
          </footer>

          <MethodologyModal open={methodologyOpen} onClose={() => setMethodologyOpen(false)} />
        </>
      )}
    </div>
  );
}
