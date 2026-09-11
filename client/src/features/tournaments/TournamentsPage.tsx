import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Trophy,
  Users,
} from 'lucide-react';
import { api } from '../../shared/auth/auth.store';
import { TournamentDetailHeader } from './components/TournamentDetailHeader';
import { TournamentEmptyLeaderboard } from './components/TournamentEmptyLeaderboard';
import { TournamentLeaderboardTable } from './components/TournamentLeaderboardTable';
import { TournamentPodium } from './components/TournamentPodium';
import { TournamentUpcomingCard } from './components/TournamentUpcomingCard';
import {
  HUB_CATEGORY_META,
  TOURNAMENT_HUB_ORDER,
  tournamentHubCategory,
  type TournamentHubCategoryId,
} from './lib/tournamentHubCategory';
import { TOURNAMENT_TYPE_BADGE } from './lib/tournamentMetricDisplay';
import type { TournamentDetail, TournamentSummary } from './lib/tournaments.types';
import { useTournamentHubSocket } from './lib/useTournamentHubSocket';

const TYPE_ORDER = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const;

function sortTypes(types: string[]): string[] {
  return [...types].sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a as (typeof TYPE_ORDER)[number]) -
      TYPE_ORDER.indexOf(b as (typeof TYPE_ORDER)[number]),
  );
}

export default function TournamentsPage() {
  const { t } = useTranslation();
  const [list, setList] = useState<TournamentSummary[]>([]);
  const [hubId, setHubId] = useState<TournamentHubCategoryId | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hubInit = useRef<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const res = await api.get<{ tournaments?: TournamentSummary[] }>('/tournaments');
      setList(res.data.tournaments ?? []);
    } catch {
      setError(t('tournaments.errors.loadList'));
    } finally {
      setListLoading(false);
    }
  }, [t]);

  const loadDetail = useCallback(
    async (id: number) => {
      setDetailLoading(true);
      setError(null);
      try {
        const res = await api.get<TournamentDetail>(`/tournaments/${id}`);
        setDetail(res.data);
      } catch {
        setError(t('tournaments.errors.loadDetail'));
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId != null) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const onSocketUpdate = useCallback(
    (payload: { tournamentId: number; top?: TournamentDetail['top']; participantCount?: number }) => {
      setDetail((prev) => {
        if (!prev || payload.tournamentId !== prev.tournament.id) return prev;
        return {
          ...prev,
          top: (payload.top as TournamentDetail['top']) ?? prev.top,
          tournament: {
            ...prev.tournament,
            _count: {
              entries: payload.participantCount ?? prev.tournament._count?.entries ?? 0,
            },
          },
        };
      });
    },
    [],
  );

  const { connected: liveConnected, lastUpdateAt } = useTournamentHubSocket({
    tournamentId: selectedId,
    onUpdate: onSocketUpdate,
    onPoll: () => {
      if (selectedId != null) void loadDetail(selectedId);
    },
  });

  const active = useMemo(() => list.filter((row) => row.status === 'ACTIVE'), [list]);
  const scheduled = useMemo(() => list.filter((row) => row.status === 'SCHEDULED'), [list]);

  const hubs = useMemo(() => {
    const map = new Map<TournamentHubCategoryId, TournamentSummary[]>();
    for (const row of active) {
      const id = tournamentHubCategory(row.metric);
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(row);
    }
    return TOURNAMENT_HUB_ORDER.filter((id) => map.has(id)).map((id) => ({
      id,
      items: map.get(id)!,
    }));
  }, [active]);

  const currentHub = hubId ? hubs.find((h) => h.id === hubId) : null;

  useEffect(() => {
    if (hubId != null || hubs.length !== 1) return;
    setHubId(hubs[0].id);
  }, [hubs, hubId]);

  useEffect(() => {
    if (!currentHub) {
      setTypeFilter(null);
      setSelectedId(null);
      hubInit.current = null;
      return;
    }
    if (hubInit.current === currentHub.id) return;
    hubInit.current = currentHub.id;
    const types = sortTypes([...new Set(currentHub.items.map((i) => i.type))]);
    setTypeFilter(types[0] ?? null);
  }, [currentHub]);

  useEffect(() => {
    if (!currentHub || !typeFilter) return;
    const typed = currentHub.items.filter((i) => i.type === typeFilter);
    const live =
      typed.find((i) => i.status === 'ACTIVE' && new Date(i.endsAt).getTime() > Date.now()) ??
      typed[0];
    setSelectedId(live?.id ?? null);
  }, [currentHub, typeFilter]);

  const hubItems =
    currentHub && typeFilter ? currentHub.items.filter((i) => i.type === typeFilter) : [];

  const openTournament = useCallback((id: number) => {
    const row = list.find((r) => r.id === id);
    if (row) {
      setHubId(tournamentHubCategory(row.metric));
      setTypeFilter(row.type);
    }
    setSelectedId(id);
  }, [list]);

  const showDetail = selectedId != null && detail?.tournament.id === selectedId;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {hubId && hubs.length > 1 ? (
            <button
              type="button"
              onClick={() => {
                setHubId(null);
                setTypeFilter(null);
                setSelectedId(null);
                setDetail(null);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/60 border border-white/10 text-slate-300 hover:bg-slate-700/60 transition-colors"
              aria-label={t('tournaments.header.back')}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15">
              <Trophy className="h-5 w-5 text-amber-400" />
            </div>
          )}
          <div>
            <h1 className="text-xl font-black text-white">
              {currentHub
                ? t('tournaments.header.titleWithCategory', {
                    category: t(`tournaments.categories.${currentHub.id}`),
                  })
                : t('tournaments.header.title')}
            </h1>
            <p className="text-xs text-slate-500">{t('tournaments.header.subtitle')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadList();
            if (selectedId) void loadDetail(selectedId);
          }}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-800/60 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700/60 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${listLoading || detailLoading ? 'animate-spin' : ''}`} />
          {t('tournaments.header.refresh')}
        </button>
      </div>

      {!currentHub && hubs.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {hubs.map(({ id, items }) => {
            const Icon = HUB_CATEGORY_META[id].icon;
            const participants = items.reduce((sum, i) => sum + (i._count?.entries ?? 0), 0);
            const typeTags = sortTypes([...new Set(items.map((i) => i.type))]);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setHubId(id)}
                className="group rounded-2xl border border-white/8 bg-slate-900/40 p-5 text-left hover:border-sky-500/40 hover:bg-slate-900/60 transition-colors"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 group-hover:bg-sky-500/25 transition-colors">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-black text-white">{t(`tournaments.categories.${id}`)}</p>
                    <p className="text-[11px] text-slate-500 font-mono">
                      {items.length}{' '}
                      {t('tournaments.activeTournaments', { count: items.length })}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-500 group-hover:text-sky-400 transition-colors" />
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-sky-400" />
                    {t('tournaments.participants', { count: participants })}
                  </span>
                  <span className="flex items-center gap-1 flex-wrap">
                    {typeTags.map((type) => (
                      <span
                        key={type}
                        className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase ${TOURNAMENT_TYPE_BADGE[type] ?? ''}`}
                      >
                        {t(`tournaments.types.${type}`)}
                      </span>
                    ))}
                  </span>
                </div>
                {id === 'games' ? (
                  <p className="mt-3 text-[10px] text-emerald-400/90 leading-snug border-t border-white/5 pt-3">
                    {t('tournaments.minigame_scoring_hint_short')}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {currentHub ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
            {sortTypes([...new Set(currentHub.items.map((i) => i.type))]).map((type) => {
              const selected = type === typeFilter;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setTypeFilter(type)}
                  className={`shrink-0 rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                    selected
                      ? 'border-sky-500/50 bg-sky-500/10 text-white'
                      : 'border-white/8 bg-slate-900/40 text-slate-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  {t(`tournaments.types.${type}`)}
                </button>
              );
            })}
          </div>
          {hubItems.length > 1 ? (
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
              {hubItems.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] transition-all ${
                    selectedId === row.id
                      ? 'border-sky-500/40 bg-sky-500/10 text-white'
                      : 'border-white/8 bg-slate-900/30 text-slate-400 hover:text-white'
                  }`}
                >
                  {row.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {selectedId != null && detailLoading && !detail ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      ) : null}

      {showDetail && detail ? (
        <div className="space-y-8">
          <TournamentDetailHeader
            detail={detail}
            liveConnected={liveConnected}
            lastUpdateAt={lastUpdateAt}
          />
          {detailLoading && detail.top.length === 0 ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
          ) : detail.top.length === 0 ? (
            <TournamentEmptyLeaderboard tournament={detail.tournament} />
          ) : (
            <>
              {detail.top.length >= 3 ? (
                <TournamentPodium entries={detail.top} metric={detail.tournament.metric} />
              ) : null}
              <TournamentLeaderboardTable detail={detail} />
            </>
          )}
        </div>
      ) : null}

      {listLoading && list.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      ) : null}

      {!listLoading && list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Trophy className="h-12 w-12 text-slate-700 mb-4" />
          <p className="text-slate-400 font-semibold">{t('tournaments.empty.noTournaments')}</p>
          <p className="text-xs text-slate-600 mt-1">{t('tournaments.empty.newAppear')}</p>
        </div>
      ) : null}

      {scheduled.length > 0 ? (
        <section>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
            {t('tournaments.upcoming')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scheduled.map((row) => (
              <TournamentUpcomingCard key={row.id} tournament={row} onOpen={() => openTournament(row.id)} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
