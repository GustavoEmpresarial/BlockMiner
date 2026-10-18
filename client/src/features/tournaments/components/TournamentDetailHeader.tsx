import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CalendarCheck,
  CheckCircle,
  CheckSquare,
  ClipboardList,
  Combine,
  Cpu,
  Droplets,
  Flame,
  Gamepad2,
  Layers,
  Link2,
  Radio,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
  Youtube,
  Zap,
} from 'lucide-react';
import type { TournamentDetail } from '../lib/tournaments.types';
import {
  formatMyScoreTotal,
  isAllActivitiesMetric,
  isBurnMetric,
  isDepositMetric,
  isMergeMetric,
  isMinigameMetric,
  isReferralMetric,
  isYoutubeMetric,
  scoreTotalI18nKey,
  TOURNAMENT_TYPE_BADGE,
  tournamentDisplayDescription,
  tournamentDisplayName,
} from '../lib/tournamentMetricDisplay';
import { TournamentCountdown } from './TournamentCountdown';
import { TournamentPrizesPanel } from './TournamentPrizeDisplay';
import { TournamentScore } from './TournamentScore';
import { OfferwallScoringPanel } from './OfferwallScoringPanel';
import { formatUtcTime } from '../../../shared/utils/utcTime';

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
    <div className="rounded-3xl border-2 border-slate-800 bg-slate-900/60 shadow-[4px_4px_0px_#000000] overflow-hidden">
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
                title={lastUpdateAt ? formatUtcTime(lastUpdateAt, { second: '2-digit', hour: '2-digit', minute: '2-digit' }) : undefined}
              >
                <Radio className="h-3 w-3 animate-pulse" />
                {t('tournaments.realtime')}
              </span>
            ) : null}
          </div>

          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">{tournamentDisplayName(tournament)}</h2>

          {tournament.preview ? (
            <p className="inline-flex max-w-2xl items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-[11px] font-bold text-yellow-200">
              {t('tournaments.preview_notice')}
            </p>
          ) : null}

          {tournamentDisplayDescription(tournament) ? (
            <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">{tournamentDisplayDescription(tournament)}</p>
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

          {isAllActivitiesMetric(tournament.metric) ? (
            <div className="mt-3 rounded-2xl border-2 border-sky-500/30 bg-sky-950/20 p-4 max-w-2xl space-y-3 shadow-[2px_2px_0px_#000000]">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] font-black uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                  {t('tournaments.all_activities_scoring_title')}
                </p>
                <span className="text-[10px] text-sky-300 font-mono font-bold bg-sky-500/20 border border-sky-500/30 px-2 py-0.5 rounded-md">
                  {t('tournaments.all_activities_each_point')}
                </span>
              </div>
              <p className="text-xs text-sky-100/90 leading-relaxed">
                {t('tournaments.all_activities_scoring_desc')}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 border border-white/5 p-2 text-slate-300">
                  <Droplets className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white text-[10px] leading-tight">{t('tournaments.activity_faucet')}</p>
                    <p className="text-[9px] text-sky-400 font-mono">+1 pt / claim</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 border border-white/5 p-2 text-slate-300">
                  <Link2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white text-[10px] leading-tight">{t('tournaments.activity_shortlinks')}</p>
                    <p className="text-[9px] text-emerald-400 font-mono">+1 pt / link</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 border border-white/5 p-2 text-slate-300">
                  <Cpu className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white text-[10px] leading-tight">{t('tournaments.activity_auto_mining')}</p>
                    <p className="text-[9px] text-amber-400 font-mono">+1 pt / claim</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 border border-white/5 p-2 text-slate-300">
                  <Gamepad2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white text-[10px] leading-tight">{t('tournaments.activity_minigames')}</p>
                    <p className="text-[9px] text-purple-400 font-mono">+1 pt / vitória</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 border border-white/5 p-2 text-slate-300">
                  <Youtube className="h-3.5 w-3.5 text-red-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white text-[10px] leading-tight">{t('tournaments.activity_youtube')}</p>
                    <p className="text-[9px] text-red-400 font-mono">{t('tournaments.activity_youtube_points')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 border border-white/5 p-2 text-slate-300">
                  <CalendarCheck className="h-3.5 w-3.5 text-teal-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white text-[10px] leading-tight">{t('tournaments.activity_checkin')}</p>
                    <p className="text-[9px] text-teal-400 font-mono">+1 pt / dia</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 border border-white/5 p-2 text-slate-300">
                  <CheckSquare className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white text-[10px] leading-tight">{t('tournaments.activity_tasks')}</p>
                    <p className="text-[9px] text-indigo-400 font-mono">{t('tournaments.activity_pt_per_task')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-slate-900/60 border border-white/5 p-2 text-slate-300">
                  <Layers className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                  <div>
                    <p className="font-bold text-white text-[10px] leading-tight">{t('tournaments.activity_offers_ptc')}</p>
                    <p className="text-[9px] text-orange-400 font-mono">{t('tournaments.activity_pt_per_action')}</p>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-sky-200/70 font-mono">
                {t('tournaments.scores_live_hint')}
              </p>
            </div>
          ) : null}

          {detail.offerwallRules ? (
            <OfferwallScoringPanel
              rules={detail.offerwallRules}
              breakdown={detail.myOfferwallBreakdown}
              loggedIn={detail.myOfferwallBreakdown != null}
            />
          ) : null}

          {isYoutubeMetric(tournament.metric) ? (
            <div className="mt-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-300 mb-1.5">
                {t('tournaments.youtube_scoring_title')}
              </p>
              <p className="text-xs text-red-50/90 leading-relaxed">
                {t('tournaments.youtube_scoring_hint')}
              </p>
            </div>
          ) : null}

          {isReferralMetric(tournament.metric) ? (
            <div className="mt-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-300 mb-1.5 flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                {t('tournaments.referral_scoring_title')}
              </p>
              <p className="text-xs text-violet-50/90 leading-relaxed">
                {t('tournaments.referral_scoring_hint')}
              </p>
              <p className="mt-2 text-[10px] text-violet-200/70 font-mono">
                {t('tournaments.referral_anti_fraud_note')}
              </p>
            </div>
          ) : null}

          {isMergeMetric(tournament.metric) ? (
            <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-300 mb-1.5 flex items-center gap-1.5">
                <Combine className="h-3.5 w-3.5" />
                {t('tournaments.merge_scoring_title')}
              </p>
              <p className="text-xs text-amber-50/90 leading-relaxed">{t('tournaments.merge_scoring_hint')}</p>
              <Link
                to="/merge"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-[11px] font-black text-slate-950 transition-colors"
              >
                <Combine className="h-3.5 w-3.5" />
                {t('tournaments.merge_cta')}
              </Link>
            </div>
          ) : null}

          {isBurnMetric(tournament.metric) ? (
            <div className="mt-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-300 mb-1.5 flex items-center gap-1.5">
                <Flame className="h-3.5 w-3.5" />
                {t('tournaments.burn_scoring_title')}
              </p>
              <p className="text-xs text-orange-50/90 leading-relaxed">{t('tournaments.burn_scoring_hint')}</p>
              <Link
                to="/burn"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 hover:bg-orange-400 px-3 py-1.5 text-[11px] font-black text-slate-950 transition-colors"
              >
                <Flame className="h-3.5 w-3.5" />
                {t('tournaments.burn_cta')}
              </Link>
            </div>
          ) : null}

          {tournament.metric === 'TASKS_COMPLETED' ? (
            <div className="mt-2 rounded-xl border border-teal-500/30 bg-teal-500/10 px-4 py-3 max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-widest text-teal-300 mb-1.5 flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                {t('tournaments.tasks_scoring_title')}
              </p>
              <p className="text-xs text-teal-50/90 leading-relaxed">{t('tournaments.tasks_scoring_hint')}</p>
              <Link
                to="/tasks"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 px-3 py-1.5 text-[11px] font-black text-slate-950 transition-colors"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                {t('tournaments.tasks_cta')}
              </Link>
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

        <div className="rounded-2xl border-2 border-amber-500/30 bg-amber-950/20 p-4 max-w-xs w-full shadow-[2px_2px_0px_#000000]">
          <p className="text-[10px] uppercase tracking-widest text-amber-400 font-mono mb-2">
            {t('tournaments.prizes')}
          </p>
          <TournamentPrizesPanel prizes={tournament.prizes} />
        </div>
      </div>

      {myEntry ? (
        <div
          className={`border-t-2 border-slate-800 px-6 py-3.5 flex flex-col gap-2 text-xs bg-slate-950/60 shadow-[2px_2px_0px_#000000]`}
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
