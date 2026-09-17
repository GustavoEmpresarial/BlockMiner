import { useTranslation } from 'react-i18next';
import type { LeaderboardEntry, TournamentDetail, TournamentPrize } from '../lib/tournaments.types';
import { scoreColumnI18nKey } from '../lib/tournamentMetricDisplay';
import { TournamentScore } from './TournamentScore';
import { TournamentPrizeInline } from './TournamentPrizeDisplay';

function rankBadgeRowClass(index: number): string {
  if (index === 0) return 'bg-amber-500 text-slate-950';
  if (index === 1) return 'bg-slate-400 text-slate-950';
  if (index === 2) return 'bg-orange-700 text-white';
  return 'bg-slate-800 text-slate-500';
}

function findPrizeForRank(prizes: TournamentPrize[], rank: number): TournamentPrize | undefined {
  return prizes.find((p) => rank >= p.rankFrom && rank <= p.rankTo);
}

function AvatarInitial({ entry }: { entry: LeaderboardEntry }) {
  const letter = entry.user.username.charAt(0).toUpperCase();
  return (
    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-white border border-slate-700 shrink-0">
      {letter}
    </div>
  );
}

function displayName(entry: LeaderboardEntry): string {
  return entry.user.username;
}

export function TournamentLeaderboardTable({ detail }: { detail: TournamentDetail }) {
  const { t } = useTranslation();
  const { tournament, top, myEntry, myRankLive } = detail;
  const myRank = myRankLive ?? myEntry?.rank ?? null;
  const metric = tournament.metric;

  const tableRows = top.slice(0, 10);
  const others = top.slice(10);

  return (
    <>
      <div className="bg-slate-900/60 border border-white/8 rounded-[2.5rem] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-slate-800/40 text-[10px] uppercase font-bold tracking-widest text-gray-500">
              <tr>
                <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 w-12 sm:w-20">
                  Rank
                </th>
                <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6">Miner</th>
                <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 text-right">
                  {t(scoreColumnI18nKey(metric))}
                </th>
                <th className="px-3 py-4 sm:px-6 sm:py-5 md:px-8 md:py-6 text-right hidden sm:table-cell">
                  {t('tournaments.prizes')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-medium">
              {tableRows.map((entry, index) => {
                const rank = index + 1;
                const isMe = myRank != null && rank === myRank;
                const prize = findPrizeForRank(tournament.prizes, rank);
                return (
                  <tr
                    key={entry.id}
                    className={`hover:bg-white/4 transition-colors ${isMe ? 'bg-sky-500/8' : index < 3 ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5">
                      <span
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs ${rankBadgeRowClass(index)}`}
                      >
                        {rank}
                      </span>
                    </td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5">
                      <div className="flex items-center gap-2">
                        <AvatarInitial entry={entry} />
                        <div className="min-w-0">
                          <p className="text-white font-bold truncate max-w-[150px] sm:max-w-none">
                            {displayName(entry)}
                            {isMe ? (
                              <span className="ml-1.5 text-[10px] text-sky-400 font-mono">(you)</span>
                            ) : null}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">@{entry.user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 text-right text-amber-300 font-black text-xs sm:text-sm font-mono">
                      <TournamentScore score={entry.score} metric={metric} polHint={entry.scorePol} />
                    </td>
                    <td className="px-3 py-3 sm:px-6 sm:py-4 md:px-8 md:py-5 text-right hidden sm:table-cell">
                      {prize ? (
                        <TournamentPrizeInline prize={prize} />
                      ) : (
                        <span className="text-[10px] text-slate-600 font-mono">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {others.length > 0 ? (
        <div className="rounded-2xl border border-white/8 bg-slate-900/40 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
            <span className="text-[10px] uppercase tracking-widest font-mono text-slate-500">
              {t('tournaments.otherParticipants')}
            </span>
            <span className="text-[10px] font-mono text-slate-600">
              {t('tournaments.remainingCount', { count: others.length })}
            </span>
          </div>
          <ul className="divide-y divide-white/[0.04]">
            {others.map((entry, index) => {
              const rank = index + 11;
              const isMe = myRank != null && rank === myRank;
              return (
                <li
                  key={entry.id}
                  className={`flex items-center gap-3 px-5 py-2.5 hover:bg-white/[0.03] transition-colors ${isMe ? 'bg-sky-500/8' : ''}`}
                >
                  <span className="shrink-0 w-7 text-right font-mono text-[11px] font-bold text-slate-500">
                    {rank}
                  </span>
                  <div className="shrink-0 w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[9px] font-bold text-white">
                    {(entry.user.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-300">
                      {displayName(entry)}
                      {isMe ? (
                        <span className="ml-1.5 text-[10px] text-sky-400 font-mono">(you)</span>
                      ) : null}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs text-amber-300/80 font-bold">
                    <TournamentScore score={entry.score} metric={metric} polHint={entry.scorePol} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </>
  );
}
