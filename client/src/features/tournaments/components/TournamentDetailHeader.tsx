import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, Radio, Wallet, Users, Zap } from 'lucide-react';
import type { TournamentDetail } from '../lib/tournaments.types';
import {
  formatMyScoreTotal,
  isDepositMetric,
  isMinigameMetric,
  scoreTotalI18nKey,
  TOURNAMENT_TYPE_BADGE,
} from '../lib/tournamentMetricDisplay';
import { TournamentCountdown } from './TournamentCountdown';
import { TournamentPrizesPanel } from './TournamentPrizeDisplay';
import { TournamentScore } from './TournamentScore';

export function TournamentDetailHeader({
  detail,
  liveConnected,
  lastUpdateAt,
}: {
  detail: TournamentDetail;
  liveConnected: boolean;
  lastUpdateAt: number | null;
}) {
  const { t } = useTranslation();
  const { tournament, myEntry } = detail;
  const depositMetric = isDepositMetric(tournament.metric);
  const polHint = detail.myDepositBreakdown?.breakdown.totalPol;

  return (
    <div className="rounded-[2rem] border border-white/8 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950 overflow-hidden">
      <div className="grid md:grid-cols-[1fr_auto] gap-6 p-6 md:p-7 items-center">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${TOURNAMENT_TYPE_BADGE[tournament.type] ?? 'border-white/10 text-slate-400'}`}
            >
              {t(`tournaments.types.${tournament.type}`)}
            </span>
            {tournament.status === 'ACTIVE' ? (
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {t('tournaments.status.LIVE')}
              </span>
            ) : null}
            {liveConnected ? (
              <span
                className="flex items-center gap-1 text-[10px] text-sky-400 font-mono font-bold"
                title={lastUpdateAt ? new Date(lastUpdateAt).toLocaleTimeString() : undefined}
              >
                <Radio className="h-3 w-3 animate-pulse" />
                {t('tournaments.realtime')}
              </span>
            ) : null}
          </div>

          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">{tournament.name}</h2>

          {tournament.description ? (
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">{tournament.description}</p>
          ) : null}

          <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
            {!depositMetric ? (
              <>
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  {t(`tournaments.metrics.${tournament.metric}`)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-sky-400" />
                  {t('tournaments.participants', { count: tournament._count.entries })}
                </span>
              </>
            ) : null}
            <TournamentCountdown
              startsAt={tournament.startsAt}
              endsAt={tournament.endsAt}
              status={tournament.status}
            />
            {depositMetric ? (
              <span className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-sky-400" />
                {t('tournaments.participants', { count: tournament._count.entries })}
              </span>
            ) : null}
          </div>

          {tournament.windowUtc ? (
            <p className="text-[11px] text-slate-400 font-mono">
              {t('tournaments.period_utc', {
                start: tournament.windowUtc.start,
                end: tournament.windowUtc.end,
              })}
            </p>
          ) : null}

          {isMinigameMetric(tournament.metric) ? (
            <div className="mt-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-1.5">
                {t('tournaments.minigame_scoring_title')}
              </p>
              <p className="text-xs text-emerald-50/90 leading-relaxed">
                {t('tournaments.minigame_scoring_hint')}
              </p>
              <p className="mt-2 text-[10px] text-emerald-200/70 font-mono">
                {t('tournaments.scores_live_hint')}
              </p>
            </div>
          ) : null}

          {depositMetric ? (
            <Link
              to="/wallet"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold px-4 py-2 transition-colors mt-1"
            >
              <Wallet className="h-3.5 w-3.5" />
              {t('tournaments.deposit_cta')}
            </Link>
          ) : null}
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 max-w-xs w-full">
          <p className="text-[10px] uppercase tracking-widest text-amber-400 font-mono mb-2">
            {t('tournaments.prizes')}
          </p>
          <TournamentPrizesPanel prizes={tournament.prizes} />
        </div>
      </div>

      {myEntry ? (
        <div
          className={`border-t border-white/8 px-6 py-3 flex flex-col gap-2 text-xs ${depositMetric ? 'bg-amber-500/5' : 'bg-sky-500/5'}`}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-primary font-bold uppercase tracking-wider">
              {t('tournaments.yourResult')}
            </span>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="font-mono font-black text-white text-lg">
                #{detail.myRankLive ?? myEntry.rank ?? '—'}
              </span>
              <span className="text-slate-400">
                {t(scoreTotalI18nKey(tournament.metric))}:{' '}
                {depositMetric ? (
                  <span className="text-white font-mono font-bold inline-flex">
                    <TournamentScore score={myEntry.score} metric={tournament.metric} polHint={polHint} align="center" />
                  </span>
                ) : (
                  <span className="text-white font-mono font-bold">
                    {formatMyScoreTotal(tournament.metric, myEntry.score)}
                  </span>
                )}
              </span>
              {myEntry.rewardGranted ? (
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <CheckCircle className="h-3 w-3" />
                  {t(
                    detail.myPrize?.prizeType === 'MACHINE'
                      ? 'tournaments.rewardMachineInbox'
                      : 'tournaments.rewardCredited',
                  )}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
