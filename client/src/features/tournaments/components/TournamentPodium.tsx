import { useTranslation } from 'react-i18next';
import { Crown, Medal } from 'lucide-react';
import type { LeaderboardEntry } from '../lib/tournaments.types';
import { TournamentScore } from './TournamentScore';

function displayName(entry: LeaderboardEntry): string {
  return entry.user.username;
}

export function TournamentPodium({
  entries,
  metric,
}: {
  entries: LeaderboardEntry[];
  metric: string;
}) {
  const { t } = useTranslation();
  if (entries.length < 3) return null;

  const [first, second, third] = entries;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
      <div className="order-2 md:order-1 bg-slate-900/60 border border-slate-700/40 rounded-[2.5rem] overflow-hidden text-center relative group">
        <div className="p-8 space-y-4 flex flex-col justify-center items-center min-h-[280px]">
          <div className="absolute top-0 inset-x-0 h-1 bg-slate-400/40" />
          <div className="absolute top-4 left-4">
            <span className="w-8 h-8 bg-slate-400 text-slate-950 rounded-lg flex items-center justify-center font-black text-xs shadow-lg">
              2
            </span>
          </div>
          <div className="relative z-10">
            <div className="w-16 h-16 bg-slate-400/10 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-slate-400/20 group-hover:scale-110 transition-transform">
              <Medal className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-xl font-black text-white truncate px-4">{displayName(second)}</h3>
            <p className="text-amber-300 font-bold text-lg font-mono">
              <TournamentScore
                score={second.score}
                metric={metric}
                polHint={second.scorePol}
                align="center"
              />
            </p>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {t('tournaments.podium.second')}
            </span>
          </div>
        </div>
      </div>

      <div className="order-1 md:order-2 bg-gradient-to-b from-amber-500/15 to-slate-900/80 border border-amber-500/40 rounded-[3rem] overflow-hidden text-center relative shadow-2xl shadow-amber-500/10 group">
        <div className="p-10 space-y-6 flex flex-col justify-center items-center min-h-[340px]">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-amber-500" />
          <div className="absolute top-6 left-6">
            <span className="w-10 h-10 bg-amber-500 text-slate-950 rounded-xl flex items-center justify-center font-black text-base shadow-xl animate-bounce">
              1
            </span>
          </div>
          <div className="relative z-10">
            <div className="w-24 h-24 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-amber-500/30 shadow-xl group-hover:scale-110 transition-transform duration-500">
              <Crown className="w-12 h-12 text-slate-950" />
            </div>
            <h3 className="text-2xl font-black text-white truncate px-4">{displayName(first)}</h3>
            <p className="text-amber-400 font-black text-2xl font-mono">
              <TournamentScore
                score={first.score}
                metric={metric}
                polHint={first.scorePol}
                align="center"
              />
            </p>
            <span className="text-xs font-black text-amber-500/60 uppercase tracking-[0.3em]">
              {t('tournaments.podium.champion')}
            </span>
          </div>
        </div>
      </div>

      <div className="order-3 md:order-3 bg-slate-900/60 border border-orange-700/40 rounded-[2.5rem] overflow-hidden text-center relative group">
        <div className="p-8 space-y-4 flex flex-col justify-center items-center min-h-[280px]">
          <div className="absolute top-0 inset-x-0 h-1 bg-orange-700/40" />
          <div className="absolute top-4 left-4">
            <span className="w-8 h-8 bg-orange-700 text-white rounded-lg flex items-center justify-center font-black text-xs shadow-lg">
              3
            </span>
          </div>
          <div className="relative z-10">
            <div className="w-16 h-16 bg-orange-700/15 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-orange-700/30 group-hover:scale-110 transition-transform">
              <Medal className="w-8 h-8 text-orange-500" />
            </div>
            <h3 className="text-xl font-black text-white truncate px-4">{displayName(third)}</h3>
            <p className="text-amber-300 font-bold text-lg font-mono">
              <TournamentScore
                score={third.score}
                metric={metric}
                polHint={third.scorePol}
                align="center"
              />
            </p>
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              {t('tournaments.podium.third')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
