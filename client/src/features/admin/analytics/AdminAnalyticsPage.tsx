import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Activity, BarChart2, Flame, RefreshCw, Search, TrendingUp, Users, X } from 'lucide-react';
import { api } from '../../../shared/auth/auth.store';
import { ExecutiveSummaryPanel, type ExecutiveSummary } from './ExecutiveSummaryPanel';
import {
  FinancialFlowTab,
  OverviewTab,
  ProjectionsTab,
  RewardSourcesTab,
  TopUsersTab,
} from './adminAnalytics.tabs';
import {
  PERIOD_LABELS,
  type AnalyticsForecast,
  type AnalyticsSummary,
  type AnalyticsUserRef,
  type ChartPoint,
  type DistributionResponse,
  type InflationResponse,
  type PeriodKey,
  type ProjectionsResponse,
  type TopEarnerRow,
  type UserRecentBlockRow,
  type WalletActivityPayload,
  type WithdrawalsResponse,
} from './adminAnalytics.shared';

type AnalyticsPayload = {
  ok?: boolean;
  polPrice?: number;
  summary?: AnalyticsSummary;
  forecast?: AnalyticsForecast;
  topEarners?: TopEarnerRow[];
  chartData?: ChartPoint[];
  userRecentBlocks?: UserRecentBlockRow[];
};

type TabKey = 'overview' | 'financial-flow' | 'projections' | 'reward-sources' | 'top-users' | 'executive';

const TABS: Array<{ key: TabKey; label: string; icon: typeof Activity }> = [
  { key: 'overview', label: 'Visão geral', icon: BarChart2 },
  { key: 'financial-flow', label: 'Fluxo financeiro', icon: TrendingUp },
  { key: 'projections', label: 'Projeções', icon: Activity },
  { key: 'reward-sources', label: 'Fontes de recompensa', icon: Flame },
  { key: 'top-users', label: 'Top usuários', icon: Users },
  { key: 'executive', label: 'Executivo', icon: Search },
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
  const [depositLoading, setDepositLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<AnalyticsUserRef[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AnalyticsUserRef | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ period });
      if (selectedUser) params.set('userId', String(selectedUser.id));
      const q = params.toString();
      const [main, infl, proj, wd, dist, exec] = await Promise.all([
        api.get<AnalyticsPayload>(`/admin/analytics?${q}`),
        api.get<InflationResponse & { ok?: boolean }>(`/admin/analytics/inflation?${q}`),
        api.get<ProjectionsResponse & { ok?: boolean }>(`/admin/analytics/projections?${q}`),
        api.get<WithdrawalsResponse & { ok?: boolean }>(`/admin/analytics/withdrawals?${q}`),
        api.get<DistributionResponse & { ok?: boolean }>(`/admin/analytics/distribution?${q}`),
        api.get<{ ok?: boolean; executive?: ExecutiveSummary }>(`/admin/analytics/executive?period=${period}`),
      ]);
      if (main.data.ok !== false) setPayload(main.data);
      if (infl.data.ok !== false) setInflation(infl.data);
      if (proj.data.ok !== false) setProjections(proj.data);
      if (wd.data.ok !== false) setWithdrawals(wd.data);
      if (dist.data.ok !== false) setDistribution(dist.data);
      if (exec.data.ok && exec.data.executive) setExecutive(exec.data.executive);
    } catch {
      toast.error('Erro ao carregar analytics.');
    } finally {
      setLoading(false);
    }
  }, [period, selectedUser]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void (async () => {
        if (!userQuery.trim()) {
          setUserResults([]);
          return;
        }
        setSearching(true);
        try {
          const res = await api.get<{ ok?: boolean; users?: AnalyticsUserRef[] }>(
            `/admin/users?pageSize=8&q=${encodeURIComponent(userQuery.trim())}`,
          );
          if (res.data.ok) setUserResults(res.data.users ?? []);
        } catch {
          /* ignore */
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(t);
  }, [userQuery]);

  const loadDeposits = useCallback(async () => {
    try {
      setDepositLoading(true);
      const res = await api.get<WalletActivityPayload & { ok?: boolean }>(
        '/admin/transparency/tracked-wallets/activity',
      );
      if (res.data.ok !== false) setDepositData(res.data);
    } catch {
      toast.error('Erro ao carregar dados das carteiras de depósito.');
    } finally {
      setDepositLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'financial-flow' && !depositData) void loadDeposits();
  }, [tab, depositData, loadDeposits]);

  const polPrice = payload?.polPrice ?? inflation?.polPrice ?? 0;
  const periodLabel = PERIOD_LABELS[period];

  return (
    <div className="animate-in fade-in space-y-6 duration-700">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-black text-white">Analytics Financeiros</h2>
          <p className="text-sm font-medium text-slate-500">
            Distribuição de recompensas, saques e previsões.
            {polPrice > 0 ? (
              <span className="ml-2 font-black text-amber-400">1 POL = ${polPrice.toFixed(4)} USD</span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['week', 'month', 'year'] as PeriodKey[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest transition-all ${
                period === p ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {p === 'week' ? '7D' : p === 'month' ? '30D' : '12M'}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl bg-slate-800 p-2 text-slate-400 transition-all hover:bg-slate-700 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <p className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <Search className="h-3 w-3" /> Filtrar por usuário (opcional)
        </p>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setUserQuery(e.target.value);
              }}
              placeholder="Buscar por nome, e-mail, ID ou carteira..."
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white transition-all focus:border-amber-500/50 focus:outline-none"
            />
            {searching ? (
              <RefreshCw className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />
            ) : null}
            {userResults.length > 0 ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl">
                {userResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="block w-full px-4 py-2 text-left text-sm text-white hover:bg-slate-700"
                    onClick={() => {
                      setSelectedUser(u);
                      setUserSearch(u.username || u.email || '');
                      setUserResults([]);
                    }}
                  >
                    {u.username || u.email || `#${u.id}`}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {selectedUser ? (
            <button
              type="button"
              onClick={() => {
                setSelectedUser(null);
                setUserSearch('');
                setUserQuery('');
              }}
              className="rounded-xl border border-slate-700 bg-slate-800 px-3 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-800">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-[11px] font-black uppercase tracking-wide transition-colors ${
                tab === t.key
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' ? (
        <OverviewTab
          isLoading={loading}
          summary={payload?.summary}
          forecast={payload?.forecast}
          chartData={payload?.chartData}
          userRecentBlocks={payload?.userRecentBlocks}
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
          isLoading={loading}
          periodLabel={periodLabel}
        />
      ) : null}
      {tab === 'projections' ? (
        <ProjectionsTab
          data={projections}
          polPrice={polPrice}
          isLoading={loading}
          selectedUser={selectedUser}
        />
      ) : null}
      {tab === 'reward-sources' ? (
        <RewardSourcesTab
          data={distribution}
          polPrice={polPrice}
          isLoading={loading}
          periodLabel={periodLabel}
        />
      ) : null}
      {tab === 'top-users' ? (
        <TopUsersTab topEarners={payload?.topEarners} polPrice={polPrice} isLoading={loading} />
      ) : null}
      {tab === 'executive' && executive ? (
        <ExecutiveSummaryPanel data={executive} polPrice={polPrice} />
      ) : null}
      {tab === 'executive' && !executive && loading ? (
        <div className="py-20 text-center text-sm font-bold uppercase tracking-widest text-slate-500 animate-pulse">
          Carregando resumo executivo...
        </div>
      ) : null}
    </div>
  );
}
