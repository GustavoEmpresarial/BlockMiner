import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Activity,
  BarChart2,
  Cpu,
  Flame,
  Layers,
  RefreshCw,
  Search,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { adminAnalyticsApi } from './adminAnalytics.api';
import { ExecutiveSummaryPanel } from './ExecutiveSummaryPanel';
import {
  FinancialFlowTab,
  OverviewTab,
  ProjectionsTab,
  RewardSourcesTab,
  TopUsersTab,
} from './adminAnalytics.tabs';
import {
  PERIOD_LABELS,
  type AnalyticsPayload,
  type AnalyticsUserRef,
  type DistributionResponse,
  type ExecutiveSummary,
  type InflationResponse,
  type PeriodKey,
  type ProjectionsResponse,
  type TabKey,
  type WalletActivityPayload,
  type WithdrawalsResponse,
} from './adminAnalytics.shared';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Activity; badge?: string }> = [
  { key: 'overview', label: 'Visão geral', icon: BarChart2 },
  { key: 'financial-flow', label: 'Fluxo financeiro', icon: TrendingUp },
  { key: 'projections', label: 'Projeções', icon: Activity },
  { key: 'reward-sources', label: 'Fontes de recompensa', icon: Flame },
  { key: 'top-users', label: 'Top mineradores', icon: Users },
  { key: 'executive', label: 'Resumo executivo', icon: Layers },
];

const PERIOD_OPTIONS: Array<{ key: PeriodKey; label: string }> = [
  { key: 'day', label: '24H' },
  { key: 'week', label: '7D' },
  { key: 'month', label: '30D' },
  { key: 'year', label: '12M' },
  { key: 'all', label: 'Tudo' },
];

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [tab, setTab] = useState<TabKey>('overview');
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);
  const [inflation, setInflation] = useState<InflationResponse | null>(null);
  const [projections, setProjections] = useState<ProjectionsResponse | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalsResponse | null>(null);
  const [distribution, setDistribution] = useState<DistributionResponse | null>(null);
  const [executive, setExecutive] = useState<ExecutiveSummary | null>(null);
  const [depositData, setDepositData] = useState<WalletActivityPayload | null>(null);

  const [loading, setLoading] = useState(true);
  const [depositLoading, setDepositLoading] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);

  const [userSearch, setUserSearch] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<AnalyticsUserRef[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AnalyticsUserRef | null>(null);

  // Main load: loads Overview (always)
  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminAnalyticsApi.getOverview({
        period,
        userId: selectedUser ? selectedUser.id : undefined,
      });
      if (data.ok !== false) {
        setPayload(data);
      }
    } catch {
      toast.error('Erro ao carregar dados de visão geral do analytics.');
    } finally {
      setLoading(false);
    }
  }, [period, selectedUser]);

  // Load specific tab data on demand
  const loadTabData = useCallback(
    async (currentTab: TabKey) => {
      const qParams = {
        period,
        userId: selectedUser ? selectedUser.id : undefined,
      };

      try {
        setTabLoading(true);
        if (currentTab === 'financial-flow') {
          const [inflRes, wdRes] = await Promise.all([
            adminAnalyticsApi.getInflation(qParams),
            adminAnalyticsApi.getWithdrawals(qParams),
          ]);
          setInflation(inflRes);
          setWithdrawals(wdRes);
        } else if (currentTab === 'projections') {
          const projRes = await adminAnalyticsApi.getProjections(qParams);
          setProjections(projRes);
        } else if (currentTab === 'reward-sources') {
          const distRes = await adminAnalyticsApi.getDistribution(qParams);
          setDistribution(distRes);
        } else if (currentTab === 'executive') {
          const execRes = await adminAnalyticsApi.getExecutive(period);
          if (execRes.ok && execRes.executive) {
            setExecutive(execRes.executive);
          }
        }
      } catch {
        toast.error(`Erro ao carregar aba de ${currentTab}.`);
      } finally {
        setTabLoading(false);
      }
    },
    [period, selectedUser]
  );

  const loadDeposits = useCallback(async () => {
    try {
      setDepositLoading(true);
      const res = await adminAnalyticsApi.getTrackedWalletsActivity();
      setDepositData(res);
    } catch {
      toast.error('Erro ao consultar carteiras de tesouraria on-chain.');
    } finally {
      setDepositLoading(false);
    }
  }, []);

  // Initial and param change trigger
  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Tab switch trigger
  useEffect(() => {
    if (tab !== 'overview' && tab !== 'top-users') {
      void loadTabData(tab);
    }
    if (tab === 'financial-flow' && !depositData) {
      void loadDeposits();
    }
  }, [tab, loadTabData, depositData, loadDeposits]);

  // User search debounce
  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        if (!userQuery.trim()) {
          setUserResults([]);
          return;
        }
        setSearching(true);
        try {
          const users = await adminAnalyticsApi.searchUsers(userQuery, 8);
          setUserResults(users);
        } catch {
          // Ignore transient search error
        } finally {
          setSearching(false);
        }
      })();
    }, 280);
    return () => window.clearTimeout(t);
  }, [userQuery]);

  const handleRefreshAll = async () => {
    await Promise.all([loadOverview(), loadTabData(tab)]);
    if (tab === 'financial-flow') {
      await loadDeposits();
    }
    toast.success('Dados analíticos atualizados.');
  };

  const polPrice = payload?.polPrice ?? inflation?.polPrice ?? 0;
  const periodLabel = PERIOD_LABELS[period] ?? period;

  return (
    <div className="animate-in fade-in space-y-6 duration-500">
      {/* Top Banner / Headline */}
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900 p-6 md:flex-row md:items-center shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Analytics & Economia</h2>
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
                <span>Indicadores financeiros, emissão de blocos e solvência</span>
                {polPrice > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-black text-amber-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />1 POL = ${polPrice.toFixed(4)} USD
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Global Controls: Period selector + Refresh Button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-2xl border border-slate-800 bg-slate-950 p-1 shadow-inner">
            {PERIOD_OPTIONS.map((p) => {
              const active = period === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-black uppercase tracking-wider transition-all ${
                    active
                      ? 'bg-amber-500 text-black shadow-md font-bold'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => void handleRefreshAll()}
            disabled={loading || tabLoading}
            title="Atualizar métricas"
            className="flex items-center gap-1.5 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 transition-all hover:bg-slate-700 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading || tabLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Quick Indicator Strip */}
      {payload?.summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Distribuído ({periodLabel})</p>
              <p className="text-sm font-black text-white">
                {payload.summary.periodDistributed.toFixed(2)} POL
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
              <Wallet className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Saques ({periodLabel})</p>
              <p className="text-sm font-black text-white">
                {payload.summary.periodWithdrawals.toFixed(2)} POL
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Hashrate de Rede</p>
              <p className="text-sm font-black text-white">
                {payload.summary.networkHashRate.toFixed(2)} H/s
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Usuários Ativos</p>
              <p className="text-sm font-black text-white">
                {payload.summary.activeUsers ?? '--'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Filter by User (Quick Drilldown) */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
            <Search className="h-3.5 w-3.5 text-amber-500" />
            <span>Filtrar métricas por usuário</span>
            {selectedUser ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                <UserCheck className="h-3 w-3" />
                {selectedUser.username || selectedUser.email || `#${selectedUser.id}`}
              </span>
            ) : null}
          </div>

          <div className="relative flex-1 sm:max-w-md">
            <div className="relative">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setUserQuery(e.target.value);
                }}
                placeholder="Buscar usuário por nome, e-mail ou ID..."
                className="w-full rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2 text-xs text-white placeholder-slate-500 transition-all focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              {searching ? (
                <RefreshCw className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400" />
              ) : selectedUser ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setUserSearch('');
                    setUserQuery('');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-white"
                  title="Limpar filtro de usuário"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {userResults.length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-2xl divide-y divide-slate-800">
                {userResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                    onClick={() => {
                      setSelectedUser(u);
                      setUserSearch(u.username || u.email || `#${u.id}`);
                      setUserResults([]);
                    }}
                  >
                    <span className="font-bold text-white">{u.username || u.email}</span>
                    <span className="text-[10px] text-slate-500 font-mono">ID #{u.id}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex overflow-x-auto no-scrollbar gap-1.5 border-b border-slate-800 pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                active
                  ? 'border border-amber-500/40 bg-amber-500/15 text-amber-400 shadow-sm'
                  : 'border border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? 'text-amber-400' : 'text-slate-500'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}
      {tab === 'overview' ? (
        <OverviewTab
          isLoading={loading}
          summary={payload?.summary}
          forecast={payload?.forecast}
          chartData={payload?.chartData}
          userRecentBlocks={payload?.userRecentBlocks ?? undefined}
          polPrice={polPrice}
          period={period}
          periodLabel={periodLabel}
          selectedUser={selectedUser}
        />
      ) : null}

      {tab === 'financial-flow' ? (
        <FinancialFlowTab
          depositData={depositData}
          depositLoading={depositLoading}
          onRefreshDeposits={() => void loadDeposits()}
          withdrawals={withdrawals}
          inflation={inflation}
          polPrice={polPrice}
          isLoading={tabLoading}
          periodLabel={periodLabel}
        />
      ) : null}

      {tab === 'projections' ? (
        <ProjectionsTab
          data={projections}
          polPrice={polPrice}
          isLoading={tabLoading}
          selectedUser={selectedUser}
        />
      ) : null}

      {tab === 'reward-sources' ? (
        <RewardSourcesTab
          data={distribution}
          polPrice={polPrice}
          isLoading={tabLoading}
          periodLabel={periodLabel}
        />
      ) : null}

      {tab === 'top-users' ? (
        <TopUsersTab
          topEarners={payload?.topEarners}
          polPrice={polPrice}
          isLoading={loading}
        />
      ) : null}

      {tab === 'executive' && executive ? (
        <ExecutiveSummaryPanel data={executive} polPrice={polPrice} />
      ) : null}

      {tab === 'executive' && !executive && tabLoading ? (
        <div className="py-24 text-center">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-4 shadow-xl">
            <RefreshCw className="h-5 w-5 animate-spin text-amber-400" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-300">
              Carregando resumo executivo da plataforma...
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
