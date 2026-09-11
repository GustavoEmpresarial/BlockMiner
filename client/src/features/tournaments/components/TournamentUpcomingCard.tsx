import { useTranslation } from 'react-i18next';
import { ChevronRight, Gift, Users, Zap } from 'lucide-react';
import type { TournamentSummary } from '../lib/tournaments.types';
import { isDepositMetric, isMinigameMetric, TOURNAMENT_TYPE_BADGE } from '../lib/tournamentMetricDisplay';
import { formatTournamentPrizeLabel } from '../lib/formatTournamentPrize';
import { TournamentCountdown } from './TournamentCountdown';

export function TournamentUpcomingCard({
  tournament,
  onOpen,
}: {
  tournament: TournamentSummary;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const firstPrize = tournament.prizes.find((p) => p.rankFrom === 1);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group text-left rounded-2xl border border-white/8 bg-slate-900/50 p-5 hover:border-sky-500/30 hover:bg-slate-900/70 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-500/8 w-full"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${TOURNAMENT_TYPE_BADGE[tournament.type] ?? ''}`}
        >
          {t(`tournaments.types.${tournament.type}`)}
        </span>
        {tournament.status === 'ACTIVE' ? (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {t('tournaments.status.LIVE')}
          </span>
        ) : null}
      </div>
      <h3 className="font-bold text-white mb-1 text-sm leading-snug">{tournament.name}</h3>
      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mb-3 flex-wrap">
        {!isDepositMetric(tournament.metric) ? (
          <>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {t(`tournaments.metrics.${tournament.metric}`)}
            </span>
            <span className="text-slate-700">·</span>
          </>
        ) : null}
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {tournament._count.entries}
        </span>
      </div>
      {isMinigameMetric(tournament.metric) ? (
        <p className="text-[10px] text-emerald-400/90 leading-snug mb-3 border-l-2 border-emerald-500/40 pl-2">
          {t('tournaments.minigame_scoring_hint_short')}
        </p>
      ) : null}
      <TournamentCountdown
        startsAt={tournament.startsAt}
        endsAt={tournament.endsAt}
        status={tournament.status}
      />
      {firstPrize ? (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <Gift className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-slate-400">
            1st:{' '}
            <span className="text-amber-300 font-semibold">
              {formatTournamentPrizeLabel(firstPrize, t)}
            </span>
          </span>
        </div>
      ) : null}
      <div className="mt-4 flex items-center gap-1 text-xs text-sky-400 group-hover:gap-2 transition-all">
        {t('tournaments.viewDetails')}
        <ChevronRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}
