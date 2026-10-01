import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Globe,
  Info,
  Layers,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { adminTrafficApi } from './adminTraffic.api';
import type {
  AdminTrafficDailyRow,
  AdminTrafficDaysOption,
  AdminTrafficDomainRow,
  AdminTrafficSortDirection,
  AdminTrafficSortKey,
  AdminTrafficSummary,
  AdminTrafficTab,
  AdminTrafficUtmRow,
} from './adminTraffic.types';

const DAYS_OPTIONS: AdminTrafficDaysOption[] = [7, 14, 30, 60, 90, 180, 365];

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
}

function formatNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0';
  return n.toLocaleString('pt-BR');
}

export default function AdminTrafficStatsPage() {
  const [days, setDays] = useState<AdminTrafficDaysOption>(30);
  const [tab, setTab] = useState<AdminTrafficTab>('overview');
  const [summary, setSummary] = useState<AdminTrafficSummary | null>(null);
  const [daily, setDaily] = useState<AdminTrafficDailyRow[]>([]);
  const [domains, setDomains] = useState<AdminTrafficDomainRow[]>([]);
  const [utmRows, setUtmRows] = useState<AdminTrafficUtmRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Search & Sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<AdminTrafficSortKey>('hits');
  const [sortDirection, setSortDirection] = useState<AdminTrafficSortDirection>('desc');

  // Chart hover state
  const [hoveredDay, setHoveredDay] = useState<AdminTrafficDailyRow | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await adminTrafficApi.getAll(days);
      setSummary(data.summary);
      setDaily(data.daily);
      setDomains(data.domains);
      setUtmRows(data.utm);
    } catch {
      setErrorMessage('Não foi possível carregar as estatísticas de tráfego. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Toggle sort direction or change sort column
  const handleSort = (key: AdminTrafficSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  // Filtered and sorted domains
  const processedDomains = useMemo(() => {
    let list = [...domains];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => r.domain.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;
      if (sortKey === 'name') {
        valA = a.domain.toLowerCase();
        valB = b.domain.toLowerCase();
      } else if (sortKey === 'hits') {
        valA = a.hits;
        valB = b.hits;
      } else if (sortKey === 'registrations') {
        valA = a.registrations;
        valB = b.registrations;
      } else if (sortKey === 'conversionRate') {
        valA = a.conversionRate ?? 0;
        valB = b.conversionRate ?? 0;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [domains, searchQuery, sortKey, sortDirection]);

  // Filtered and sorted UTM sources
  const processedUtmRows = useMemo(() => {
    let list = [...utmRows];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((r) => r.source.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;
      if (sortKey === 'name') {
        valA = a.source.toLowerCase();
        valB = b.source.toLowerCase();
      } else if (sortKey === 'hits') {
        valA = a.hits;
        valB = b.hits;
      } else if (sortKey === 'registrations') {
        valA = a.registrations;
        valB = b.registrations;
      } else if (sortKey === 'conversionRate') {
        valA = a.conversionRate ?? 0;
        valB = b.conversionRate ?? 0;
      }
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [utmRows, searchQuery, sortKey, sortDirection]);

  // Top days calculations
  const topDayByHits = useMemo(() => {
    if (daily.length === 0) return null;
    return [...daily].sort((a, b) => b.hits - a.hits)[0] ?? null;
  }, [daily]);

  const topDayByRegs = useMemo(() => {
    if (daily.length === 0) return null;
    return [...daily].sort((a, b) => b.registrations - a.registrations)[0] ?? null;
  }, [daily]);

  // Max value for bar chart height normalization
  const maxBarValue = useMemo(() => {
    if (daily.length === 0) return 1;
    const maxHits = Math.max(...daily.map((r) => r.hits), 0);
    const maxRegs = Math.max(...daily.map((r) => r.registrations), 0);
    return Math.max(maxHits, maxRegs, 1);
  }, [daily]);

  // Max domain hits for progress bars
  const maxDomainHits = useMemo(() => {
    if (domains.length === 0) return 1;
    return Math.max(...domains.map((d) => d.hits), 1);
  }, [domains]);

  // Max utm hits for progress bars
  const maxUtmHits = useMemo(() => {
    if (utmRows.length === 0) return 1;
    return Math.max(...utmRows.map((u) => u.hits), 1);
  }, [utmRows]);

  return (
    <div className="space-y-6">
      {/* ─── Top Header & Controls ────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight text-white">Estatísticas de Tráfego & Origem</h1>
              <p className="text-xs text-slate-400">Monitoramento analítico de visitas da landing page, cadastros e canais de conversão</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Days range pills */}
          <div className="flex items-center rounded-lg border border-slate-800 bg-slate-900/80 p-1">
            {DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all ${
                  days === d
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-sm shadow-sky-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-slate-700 hover:text-white disabled:opacity-50"
            title="Atualizar dados de tráfego"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* ─── Error Alert ──────────────────────────────────────────────────── */}
      {errorMessage ? (
        <div className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <X className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="font-bold underline hover:text-white"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {/* ─── KPI Metric Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Period Hits */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden group hover:border-sky-500/40 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Landing Hits</span>
            <Activity className="h-4 w-4 text-sky-400" />
          </div>
          <p className="text-2xl font-black text-sky-400">
            {loading && !summary ? '—' : formatNum(summary?.periodHits)}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Últimos {days} dias</span>
            {summary && summary.totalHits > 0 ? (
              <span className="text-slate-400 font-medium">
                {Math.round((summary.periodHits / summary.totalHits) * 100)}% do total
              </span>
            ) : null}
          </div>
        </div>

        {/* Period Registrations */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Cadastros</span>
            <Users className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black text-emerald-400">
            {loading && !summary ? '—' : formatNum(summary?.periodRegs)}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Últimos {days} dias</span>
            {summary && summary.totalRegs > 0 ? (
              <span className="text-slate-400 font-medium">
                {Math.round((summary.periodRegs / summary.totalRegs) * 100)}% do total
              </span>
            ) : null}
          </div>
        </div>

        {/* Conversion Rate */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden group hover:border-amber-500/40 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Ratio Conversão</span>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black text-amber-400">
            {loading && !summary ? '—' : formatPct(summary?.conversionRate)}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Cadastros / Hits</span>
            <span className="text-amber-500/80 text-[10px] font-medium">período</span>
          </div>
        </div>

        {/* Average Daily Hits */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden group hover:border-indigo-500/40 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Média Visitas/Dia</span>
            <BarChart3 className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-black text-indigo-300">
            {loading && !summary ? '—' : formatNum(summary?.avgDailyHits)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Média diária</p>
        </div>

        {/* Average Daily Registrations */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden group hover:border-purple-500/40 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Média Contas/Dia</span>
            <Sparkles className="h-4 w-4 text-purple-400" />
          </div>
          <p className="text-2xl font-black text-purple-300">
            {loading && !summary ? '—' : formatNum(summary?.avgDailyRegs)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Média diária</p>
        </div>

        {/* Total Historical Volume */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 relative overflow-hidden group hover:border-cyan-500/40 transition-colors">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Volume Geral</span>
            <CheckCircle2 className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="text-lg font-black text-slate-200">
            {loading && !summary ? '—' : formatNum(summary?.totalHits)} <span className="text-xs font-normal text-slate-400">hits</span>
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-400">
            {loading && !summary ? '—' : formatNum(summary?.totalRegs)} <span className="text-[10px] text-slate-500 font-normal">cadastros</span>
          </p>
        </div>
      </div>

      {/* ─── Informative Context Banner ──────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3.5 text-xs text-sky-200/90">
        <Info className="h-4 w-4 shrink-0 text-sky-400 mt-0.5" />
        <div className="space-y-0.5">
          <span className="font-semibold text-sky-300">Nota Metodológica de Telemetria:</span>{' '}
          Os <strong className="text-white">Landing Hits</strong> correspondem exclusivamente a acessos à página inicial (<code className="text-sky-300 font-mono text-[11px]">/</code>).
          Os <strong className="text-white">Cadastros</strong> incluem todas as contas criadas na plataforma no período (incluindo usuários direcionados diretamente para o fluxo de registro ou convites diretos).
          Por essa razão, o ratio representa a proporção bruta de aquisição.
        </div>
      </div>

      {/* ─── Navigation Tabs ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
              tab === 'overview'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            <span>Visão Geral & Gráfico</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('domains')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
              tab === 'domains'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <Globe className="h-4 w-4" />
            <span>Por Domínio</span>
            <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              {domains.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab('utm')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
              tab === 'utm'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Por UTM Source</span>
            <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              {utmRows.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab('daily')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${
              tab === 'daily'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            <Calendar className="h-4 w-4" />
            <span>Série Diária</span>
            <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
              {daily.length}d
            </span>
          </button>
        </div>

        {/* Search input for tabs with tables */}
        {(tab === 'domains' || tab === 'utm') ? (
          <div className="relative mb-2 sm:mb-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Filtrar ${tab === 'domains' ? 'domínios' : 'fontes UTM'}...`}
              className="w-full sm:w-64 rounded-lg border border-slate-800 bg-slate-900/90 pl-8 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ─── TAB 1: OVERVIEW & CHART ─────────────────────────────────────── */}
      {tab === 'overview' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-sky-400" />
                  Evolução Temporal Diária
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Comparação diária entre volume de visitas na landing page e conversão de novos usuários
                </p>
              </div>

              {/* Chart Legend */}
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-sky-500" />
                  <span className="text-slate-300 font-medium">Landing Hits</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 rounded bg-emerald-500" />
                  <span className="text-slate-300 font-medium">Cadastros</span>
                </div>
              </div>
            </div>

            {loading && daily.length === 0 ? (
              <div className="flex h-56 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
              </div>
            ) : daily.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center text-slate-500 text-xs">
                <Calendar className="h-8 w-8 text-slate-600 mb-2" />
                <p>Nenhum dado registrado para o período de {days} dias selecionado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Responsive CSS Bar Chart */}
                <div className="overflow-x-auto pb-2">
                  <div className="min-w-[650px]">
                    <div className="relative flex h-52 items-end gap-1 pt-6 px-1 border-b border-slate-800/80">
                      {daily.map((r) => {
                        const hitHeight = Math.max((r.hits / maxBarValue) * 100, 2);
                        const regHeight = Math.max((r.registrations / maxBarValue) * 100, 2);
                        const isHovered = hoveredDay?.date === r.date;

                        return (
                          <div
                            key={r.date}
                            onMouseEnter={() => setHoveredDay(r)}
                            onMouseLeave={() => setHoveredDay(null)}
                            className={`group relative flex h-full flex-1 cursor-pointer flex-col justify-end gap-0.5 transition-all ${
                              isHovered ? 'opacity-100 scale-105' : 'hover:opacity-100'
                            }`}
                          >
                            {/* Bars Container */}
                            <div className="flex h-full w-full items-end justify-center gap-0.5">
                              {/* Hits bar */}
                              <div
                                className={`w-full rounded-t transition-all ${
                                  isHovered
                                    ? 'bg-sky-400 shadow-md shadow-sky-500/50'
                                    : 'bg-sky-500/60 group-hover:bg-sky-400'
                                }`}
                                style={{ height: `${hitHeight}%` }}
                              />
                              {/* Registrations bar */}
                              <div
                                className={`w-full rounded-t transition-all ${
                                  isHovered
                                    ? 'bg-emerald-400 shadow-md shadow-emerald-500/50'
                                    : 'bg-emerald-500/80 group-hover:bg-emerald-400'
                                }`}
                                style={{ height: `${regHeight}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Timeline labels under the chart */}
                    <div className="flex justify-between pt-2 text-[10px] text-slate-500 font-mono">
                      <span>{daily[0]?.date}</span>
                      {daily.length > 10 ? <span>{daily[Math.floor(daily.length / 2)]?.date}</span> : null}
                      <span>{daily[daily.length - 1]?.date}</span>
                    </div>
                  </div>
                </div>

                {/* Hover Details Panel */}
                {hoveredDay ? (
                  <div className="rounded-lg border border-sky-500/30 bg-slate-950/80 p-3 flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-sky-400" />
                      <span className="font-bold text-white">{hoveredDay.date}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Hits:</span>
                        <span className="font-bold text-sky-400">{formatNum(hoveredDay.hits)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Cadastros:</span>
                        <span className="font-bold text-emerald-400">{formatNum(hoveredDay.registrations)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Ratio diário:</span>
                        <span className="font-bold text-amber-400">
                          {hoveredDay.hits > 0 ? formatPct((hoveredDay.registrations / hoveredDay.hits) * 100) : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 italic text-center">
                    Passe o cursor sobre as barras do gráfico para inspecionar os valores diários detalhados.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Peak Days Cards */}
          {topDayByHits || topDayByRegs ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topDayByHits ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                      Pico de Visitas no Período
                    </span>
                    <h4 className="text-lg font-black text-white mt-0.5">{topDayByHits.date}</h4>
                    <p className="text-xs text-slate-400">
                      Recorde de <strong className="text-sky-300">{formatNum(topDayByHits.hits)}</strong> landing hits
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                    <Activity className="h-6 w-6" />
                  </div>
                </div>
              ) : null}

              {topDayByRegs ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                      Pico de Cadastros no Período
                    </span>
                    <h4 className="text-lg font-black text-white mt-0.5">{topDayByRegs.date}</h4>
                    <p className="text-xs text-slate-400">
                      Recorde de <strong className="text-emerald-300">{formatNum(topDayByRegs.registrations)}</strong> novos jogadores
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                    <Users className="h-6 w-6" />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ─── TAB 2: REFERRER DOMAINS ──────────────────────────────────────── */}
      {tab === 'domains' ? (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Tráfego por Domínio Referenciador
              </h3>
              <p className="text-[11px] text-slate-400">
                Identificação dos websites e origens que geraram visualizações e registros
              </p>
            </div>
            <span className="text-xs text-slate-400">
              Exibindo <strong className="text-white">{processedDomains.length}</strong> de {domains.length} domínios
            </span>
          </div>

          {processedDomains.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Nenhum domínio referenciador encontrado para o filtro aplicado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">
                        <span>Domínio Referenciador</span>
                        {sortKey === 'name' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : null}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('hits')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>Landing Hits</span>
                        {sortKey === 'hits' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : null}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('registrations')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>Cadastros</span>
                        {sortKey === 'registrations' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : null}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('conversionRate')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>Taxa de Conversão</span>
                        {sortKey === 'conversionRate' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : null}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center w-36">Volume Relativo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {processedDomains.map((r) => {
                    const relativePercent = Math.min(Math.round((r.hits / maxDomainHits) * 100), 100);
                    const isDirect = r.domain === 'direct' || r.domain === '(none)';

                    return (
                      <tr key={r.domain} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-slate-200">
                          <div className="flex items-center gap-2">
                            {isDirect ? (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                                Direto
                              </span>
                            ) : (
                              <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                            )}
                            <span className={isDirect ? 'text-slate-400 italic' : 'text-sky-300'}>{r.domain}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-sky-400">{formatNum(r.hits)}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-400">{formatNum(r.registrations)}</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-400">
                          {formatPct(r.conversionRate)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-sky-500 rounded-full"
                                style={{ width: `${relativePercent}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono w-7 text-right">
                              {relativePercent}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* ─── TAB 3: UTM SOURCES ───────────────────────────────────────────── */}
      {tab === 'utm' ? (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Tráfego por Parâmetro UTM (utm_source)
              </h3>
              <p className="text-[11px] text-slate-400">
                Desempenho de campanhas de marketing, canais de anúncios e links rastreados
              </p>
            </div>
            <span className="text-xs text-slate-400">
              Exibindo <strong className="text-white">{processedUtmRows.length}</strong> de {utmRows.length} fontes
            </span>
          </div>

          {processedUtmRows.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Nenhuma fonte UTM encontrada para o filtro aplicado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3 cursor-pointer hover:text-white" onClick={() => handleSort('name')}>
                      <div className="flex items-center gap-1">
                        <span>UTM Source</span>
                        {sortKey === 'name' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : null}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('hits')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>Landing Hits</span>
                        {sortKey === 'hits' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : null}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('registrations')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>Cadastros</span>
                        {sortKey === 'registrations' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : null}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right cursor-pointer hover:text-white" onClick={() => handleSort('conversionRate')}>
                      <div className="flex items-center justify-end gap-1">
                        <span>Taxa de Conversão</span>
                        {sortKey === 'conversionRate' ? (
                          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : null}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-center w-36">Volume Relativo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {processedUtmRows.map((r) => {
                    const relativePercent = Math.min(Math.round((r.hits / maxUtmHits) * 100), 100);
                    const isNone = r.source === '(none)' || !r.source;

                    return (
                      <tr key={r.source} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium text-slate-200">
                          <div className="flex items-center gap-2">
                            {isNone ? (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                                Orgânico / Sem UTM
                              </span>
                            ) : (
                              <LinkIcon className="h-3.5 w-3.5 text-purple-400" />
                            )}
                            <span className={isNone ? 'text-slate-400 italic' : 'text-purple-300 font-bold'}>{r.source}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-sky-400">{formatNum(r.hits)}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-400">{formatNum(r.registrations)}</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-400">
                          {formatPct(r.conversionRate)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-500 rounded-full"
                                style={{ width: `${relativePercent}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono w-7 text-right">
                              {relativePercent}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {/* ─── TAB 4: COMPLETE DAILY SERIES ─────────────────────────────────── */}
      {tab === 'daily' ? (
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
          <div className="border-b border-slate-800 px-5 py-3.5 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Série Temporal Diária Completa
              </h3>
              <p className="text-[11px] text-slate-400">
                Histórico detalhado dia a dia de tráfego e registros
              </p>
            </div>
            <span className="text-xs text-slate-400">
              Total de <strong className="text-white">{daily.length}</strong> dias registrados
            </span>
          </div>

          {daily.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Nenhum dado diário encontrado para o período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/40 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3 text-right">Landing Hits</th>
                    <th className="px-4 py-3 text-right">Cadastros</th>
                    <th className="px-4 py-3 text-right">Taxa Diária</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {[...daily].reverse().map((r) => {
                    const ratio = r.hits > 0 ? (r.registrations / r.hits) * 100 : null;

                    return (
                      <tr key={r.date} className="hover:bg-slate-800/20 transition-colors">
                        <td className="px-4 py-2.5 font-bold text-slate-200">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5 text-slate-500" />
                            <span>{r.date}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-sky-400">{formatNum(r.hits)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-emerald-400">{formatNum(r.registrations)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-amber-400">{formatPct(ratio)}</td>
                        <td className="px-4 py-2.5 text-center font-sans">
                          {r.hits > 0 || r.registrations > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                              Ativo
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              Sem movimento
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
