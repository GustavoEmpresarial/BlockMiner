import { Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { useUserPowerStats, useUserEarningsStats } from './lib/stats.hooks';
import { STATS_TABS, type StatsTabId, type EarningsUiFilter } from './lib/stats.config';
import type { StatsDashboardContext } from './lib/stats.types';

import { lazyWithRetry } from './utils/lazyWithRetry';

/**
 * Prefer eager imports once `client/` can Vite-build again.
 * Live SPA was patched to skip Vite `__vitePreload` + use absolute `/assets/...`
 * imports because hand-renamed chunks + mapDeps caused power-stats 404 storms.
 */
const SummaryTab = lazyWithRetry(() => import('./components/tabs/SummaryTab'));
const EarningsTab = lazyWithRetry(() => import('./components/tabs/EarningsTab'));
const PowerTab = lazyWithRetry(() => import('./components/tabs/PowerTab'));
const MachinesTab = lazyWithRetry(() => import('./components/tabs/MachinesTab'));
const BoostsTab = lazyWithRetry(() => import('./components/tabs/BoostsTab'));
const NetworkTab = lazyWithRetry(() => import('./components/tabs/NetworkTab'));
const HistoryTab = lazyWithRetry(() => import('./components/tabs/HistoryTab'));
const ToolsTab = lazyWithRetry(() => import('./components/tabs/ToolsTab'));

function TabFallback() {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-slate-500" role="status" aria-busy="true">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

export default function StatsPage() {
  const { t } = useTranslation();
  const { data, loading, error, refetch } = useUserPowerStats(45000);
  const [tab, setTab] = useState<StatsTabId>('summary');
  const [earningsFilter, setEarningsFilter] = useState<EarningsUiFilter>('30d');
  const { data: earnings, isLoading: earningsLoading, refetch: refetchEarnings } = useUserEarningsStats(earningsFilter);

  const ratioBar = useMemo(() => {
    const overview = data?.overview;
    if (!overview?.totalHashrate) return { p: 50, tmp: 50 };
    const total = overview.totalHashrate || 1;
    return {
      p: ((overview.permanentHashrate ?? 0) / total) * 100,
      tmp: ((overview.temporaryHashrate ?? 0) / total) * 100,
    };
  }, [data?.overview]);

  const ctx: StatsDashboardContext | null = data
    ? {
        power: data,
        earnings,
        earningsLoading,
        earningsFilter,
        setEarningsFilter,
        ratioBar,
        onNavigateTab: setTab,
        onRefetchPower: refetch,
      }
    : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex p-3 bg-primary/10 rounded-2xl">
            <Activity className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">{t('powerStats.title')}</h1>
          <p className="text-slate-500 font-medium max-w-2xl">{t('powerStats.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void refetch();
            void refetchEarnings();
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('powerStats.refresh')}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-slate-200">{error}</div>
      ) : null}

      {loading && !data ? (
        <TabFallback />
      ) : ctx ? (
        <>
          <div
            className="flex gap-1.5 p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl overflow-x-auto scrollbar-thin"
            role="tablist"
            aria-label={t('powerStats.tabs_label')}
          >
            {STATS_TABS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`shrink-0 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors whitespace-nowrap ${
                  tab === id ? 'bg-primary text-slate-950 shadow-lg' : 'text-slate-500 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {t(`powerStats.tab.${id}`)}
              </button>
            ))}
          </div>

          

          <Suspense fallback={<TabFallback />}>
            {tab === 'summary' && <SummaryTab {...ctx} />}
            {tab === 'earnings' && <EarningsTab {...ctx} />}
            {tab === 'power' && <PowerTab {...ctx} />}
            {tab === 'machines' && <MachinesTab {...ctx} />}
            {tab === 'boosts' && <BoostsTab {...ctx} />}
            {tab === 'network' && <NetworkTab {...ctx} />}
            {tab === 'history' && <HistoryTab {...ctx} />}
            {tab === 'tools' && <ToolsTab {...ctx} />}
          </Suspense>

          
          
        </>
      ) : null}
    </div>
  );
}
