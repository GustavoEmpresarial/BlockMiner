import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  History,
  Search,
  X,
  RefreshCw,
  Gift,
  Server,
  Wallet,
  Gamepad2,
  Shield,
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock,
  Zap,
  ShoppingCart,
  Youtube,
  Droplets,
  Link2,
  MousePointerClick,
  ListChecks,
  Cpu,
  CalendarCheck,
} from 'lucide-react';
import type { StatsDashboardContext } from '../../lib/stats.types';
import { exportUserActivityCsv } from '../../utils/exportStats';
import {
  fetchUserActivityHistory,
  type UserActivityLogItem,
  type ActivityCategory,
  type ActivityCategorySummary,
  type ActivityHistoryDays,
} from '../../lib/stats.history.api';
import { formatUtcDate, formatUtcDateTime } from '../../../../shared/utils/utcTime';

const CATEGORY_ICONS: Record<ActivityCategory, typeof Activity> = {
  all: Activity,
  purchases: ShoppingCart,
  machines: Server,
  youtube: Youtube,
  faucet: Droplets,
  shortlinks: Link2,
  ptc: MousePointerClick,
  offerwall: ListChecks,
  auto_mining: Cpu,
  games: Gamepad2,
  checkin: CalendarCheck,
  boosts: Gift,
  finance: Wallet,
  account: Shield,
  general: Activity,
};

const NEUTRAL_COLOR = { badge: 'border-slate-700 bg-slate-800 text-slate-300', dot: 'bg-slate-400' };

const CATEGORY_COLORS: Record<ActivityCategory, { badge: string; dot: string }> = {
  all: NEUTRAL_COLOR,
  purchases: { badge: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300', dot: 'bg-yellow-400' },
  machines: { badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300', dot: 'bg-amber-400' },
  youtube: { badge: 'border-red-500/40 bg-red-500/10 text-red-300', dot: 'bg-red-400' },
  faucet: { badge: 'border-sky-500/40 bg-sky-500/10 text-sky-300', dot: 'bg-sky-400' },
  shortlinks: { badge: 'border-violet-500/40 bg-violet-500/10 text-violet-300', dot: 'bg-violet-400' },
  ptc: { badge: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300', dot: 'bg-fuchsia-400' },
  offerwall: { badge: 'border-orange-500/40 bg-orange-500/10 text-orange-300', dot: 'bg-orange-400' },
  auto_mining: { badge: 'border-teal-500/40 bg-teal-500/10 text-teal-300', dot: 'bg-teal-400' },
  games: { badge: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300', dot: 'bg-indigo-400' },
  checkin: { badge: 'border-lime-500/40 bg-lime-500/10 text-lime-300', dot: 'bg-lime-400' },
  boosts: { badge: 'border-pink-500/40 bg-pink-500/10 text-pink-300', dot: 'bg-pink-400' },
  finance: { badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  account: { badge: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300', dot: 'bg-cyan-400' },
  general: NEUTRAL_COLOR,
};

const DAY_OPTIONS: ActivityHistoryDays[] = [1, 7, 30];

function formatRelativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSec < 60) return 'Agora mesmo';
    if (diffSec < 3600) return `Há ${Math.floor(diffSec / 60)} min`;
    if (diffSec < 86400) return `Há ${Math.floor(diffSec / 3600)} h`;
    if (diffSec < 172800) return 'Ontem';

    return formatUtcDate(d, { locale: 'pt-BR', fallback: dateStr });
  } catch {
    return dateStr;
  }
}

function formatExactDateTime(dateStr: string): string {
  try {
    return formatUtcDateTime(dateStr, {
      locale: 'pt-BR',
      fallback: dateStr,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function HistoryTab(_props: StatsDashboardContext) {
  const { t } = useTranslation();

  // Activity Log State
  const [logs, setLogs] = useState<UserActivityLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [category, setCategory] = useState<ActivityCategory>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [days, setDays] = useState<ActivityHistoryDays>(30);
  const [categories, setCategories] = useState<ActivityCategorySummary[]>([]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetchUserActivityHistory({
        page,
        pageSize,
        category: category !== 'all' ? category : undefined,
        q: debouncedSearch || undefined,
        days,
      });

      if (res.ok) {
        setLogs(res.logs || []);
        setTotal(res.total || 0);
        setTotalPages(res.totalPages || 1);
        setCategories(res.categories || []);
      }
    } catch {
      // best-effort
    } finally {
      setLoadingLogs(false);
    }
  }, [page, pageSize, category, debouncedSearch, days]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  // Keep the selected chip visible even when the current search/period leaves it empty.
  const visibleCategories = useMemo(() => {
    if (category === 'all' || categories.some((c) => c.id === category)) return categories;
    return [...categories, { id: category, label: t(`powerStats.history_log.cat_${category}`, category), count: 0 }];
  }, [categories, category, t]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2.5">
            <History className="w-5 h-5 text-sky-400" />
            {t('powerStats.history_log.title', 'Registro de Atividades da Conta')}
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            {t('powerStats.history_log.subtitle', 'Consulte todas as ações realizadas na sua conta em tempo real com pesquisa e filtros.')}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {logs.length > 0 && (
            <button
              type="button"
              onClick={() => exportUserActivityCsv(logs, 'blockminer-atividades')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_#000000] transition-all"
              title={t('powerStats.history_log.export_csv', 'Exportar log em CSV')}
            >
              <Download className="w-3.5 h-3.5 text-primary" />
              <span>CSV</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadLogs()}
            disabled={loadingLogs}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_#000000] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
            <span>{t('powerStats.refresh', 'Atualizar')}</span>
          </button>
        </div>
      </div>

        {/* Search Bar & Period */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('powerStats.history_log.search_placeholder', 'Pesquisar por ação, máquina, vídeo, valor ou detalhe...')}
              className="w-full bg-slate-950/80 border-2 border-slate-800 rounded-2xl pl-10 pr-9 py-2.5 text-xs text-white placeholder-slate-500 focus:border-primary focus:outline-none transition-colors shadow-[2px_2px_0px_#000000]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white p-0.5"
                aria-label={t('common.clear', 'Limpar')}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div
            className="flex shrink-0 items-center gap-1 rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-1 shadow-[2px_2px_0px_#000000]"
            role="group"
            aria-label={t('powerStats.history_log.period_label', 'Período')}
          >
            {DAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDays(d);
                  setPage(1);
                }}
                aria-pressed={days === d}
                className={`rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${
                  days === d ? 'bg-primary/20 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t(`powerStats.history_log.period_${d}d`, d === 1 ? '24h' : `${d} dias`)}
              </button>
            ))}
          </div>
        </div>

        {/* Category Chips */}
        <div className="flex flex-wrap gap-1.5">
          {visibleCategories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id] ?? Activity;
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setCategory(cat.id);
                  setPage(1);
                }}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border select-none ${
                  active
                    ? 'border-primary bg-primary/20 text-white shadow-[2px_2px_0px_#000000]'
                    : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:border-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t(`powerStats.history_log.cat_${cat.id}`, cat.label)}</span>
                <span
                  className={`text-[9px] font-mono px-1.5 rounded-full ${active ? 'bg-primary/30 text-white' : 'bg-slate-800 text-slate-500'}`}
                >
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Activity Table */}
        <div className="overflow-x-auto rounded-3xl border-2 border-slate-800 bg-slate-900/60 shadow-[4px_4px_0px_#000000]">
          <table className="w-full text-left text-sm min-w-[720px]">
            <thead className="bg-slate-950/60 text-[10px] uppercase text-slate-400 font-black tracking-widest border-b-2 border-slate-800 font-mono">
              <tr>
                <th className="p-3.5 pl-5 w-44">{t('powerStats.history_log.col_datetime', 'Data / Hora')}</th>
                <th className="p-3.5 w-40">{t('powerStats.history_log.col_category', 'Categoria')}</th>
                <th className="p-3.5">{t('powerStats.history_log.col_activity', 'Ação & Detalhes')}</th>
                <th className="p-3.5 pr-5 w-32 text-right">{t('powerStats.history_log.col_ip', 'Origem')}</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-800/80">
              {loadingLogs ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="p-4 pl-5">
                      <div className="h-4 bg-slate-800 rounded w-28 mb-1" />
                      <div className="h-3 bg-slate-800/60 rounded w-16" />
                    </td>
                    <td className="p-4">
                      <div className="h-6 bg-slate-800 rounded-xl w-24" />
                    </td>
                    <td className="p-4">
                      <div className="h-4 bg-slate-800 rounded w-48 mb-1.5" />
                      <div className="h-3 bg-slate-800/60 rounded w-72" />
                    </td>
                    <td className="p-4 pr-5 text-right">
                      <div className="h-4 bg-slate-800 rounded w-20 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-slate-800 bg-slate-950/80 text-slate-500 mb-3">
                      <History className="w-6 h-6" />
                    </div>
                    <p className="text-base font-black text-white uppercase tracking-tight">
                      {t('powerStats.history_log.empty_title', 'Nenhuma atividade encontrada')}
                    </p>
                    <p className="text-xs text-slate-400 font-medium max-w-sm mx-auto mt-1">
                      {search
                        ? t('powerStats.history_log.empty_search', 'Nenhum resultado corresponde à sua pesquisa. Tente palavras diferentes ou limpe o filtro.')
                        : t('powerStats.history_log.empty_desc', 'Não há registros de atividades recentes para a categoria selecionada.')}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((item) => {
                  const CatIcon = CATEGORY_ICONS[item.category] || Activity;
                  const catColor = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.general;
                  const hashrate = item.details?.hashRate != null ? Number(item.details.hashRate) : null;
                  const points = item.details?.tournamentOnly === true;

                  return (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition-colors group">
                      {/* Date & Time */}
                      <td className="p-3.5 pl-5 align-top">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                            <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                            {formatRelativeTime(item.createdAt)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono mt-0.5" title={item.createdAt}>
                            {formatExactDateTime(item.createdAt)}
                          </span>
                        </div>
                      </td>

                      {/* Category Badge */}
                      <td className="p-3.5 align-top">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${catColor.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${catColor.dot}`} />
                          <CatIcon className="w-3 h-3" />
                          <span>{item.categoryLabel}</span>
                        </span>
                      </td>

                      {/* Action & Description */}
                      <td className="p-3.5 align-top">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs sm:text-sm font-black text-white">{item.title}</p>
                            {hashrate != null && hashrate > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold font-mono">
                                <Zap className="w-2.5 h-2.5" />
                                +{hashrate} H/s
                              </span>
                            )}
                            {points && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-bold font-mono">
                                +1 pt Torneio YouTube
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed font-medium">
                            {item.description}
                          </p>
                        </div>
                      </td>

                      {/* IP / Origin */}
                      <td className="p-3.5 pr-5 align-top text-right">
                        <span className="text-[11px] font-mono text-slate-400">
                          {item.ip || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination Footer */}
          {total > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t-2 border-slate-800 bg-slate-950/50">
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>
                  {t('powerStats.history_log.showing', 'Mostrando')}{' '}
                  <strong className="text-white font-mono">{logs.length}</strong> de{' '}
                  <strong className="text-white font-mono">{total.toLocaleString()}</strong> eventos
                </span>
                <span className="text-slate-700">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-500">{t('powerStats.history_log.per_page', 'Por página:')}</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loadingLogs}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-[2px_2px_0px_#000000]"
                    aria-label={t('common.previous', 'Anterior')}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="text-xs text-slate-400 px-2 font-mono font-medium">
                    {page} / {totalPages}
                  </span>

                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loadingLogs}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors shadow-[2px_2px_0px_#000000]"
                    aria-label={t('common.next', 'Próxima')}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
    </div>
  );
}

export default memo(HistoryTab);
