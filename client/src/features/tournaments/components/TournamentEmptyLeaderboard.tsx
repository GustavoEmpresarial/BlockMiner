import { useTranslation } from 'react-i18next';
import { Gift, Trophy } from 'lucide-react';
import type { TournamentSummary } from '../lib/tournaments.types';
import { TournamentPrizeCard } from './TournamentPrizeDisplay';

const PODIUM_SLOTS = [
  {
    order: 'order-1 md:order-2',
    height: 'min-h-[200px]',
    border: 'border-amber-500/40',
    bg: 'from-amber-500/10 to-slate-900/60',
    bar: 'bg-amber-500',
    rank: 1,
    medalBg: 'bg-amber-500 text-slate-950',
    labelKey: 'tournaments.ui.place_1',
    glow: 'shadow-amber-500/10',
  },
  {
    order: 'order-2 md:order-1',
    height: 'min-h-[160px]',
    border: 'border-slate-500/30',
    bg: 'from-slate-400/5 to-slate-900/60',
    bar: 'bg-slate-400',
    rank: 2,
    medalBg: 'bg-slate-300 text-slate-950',
    labelKey: 'tournaments.ui.place_2',
    glow: 'shadow-slate-400/5',
  },
  {
    order: 'order-3',
    height: 'min-h-[140px]',
    border: 'border-orange-700/30',
    bg: 'from-orange-900/10 to-slate-900/60',
    bar: 'bg-orange-700',
    rank: 3,
    medalBg: 'bg-orange-700 text-white',
    labelKey: 'tournaments.ui.place_3',
    glow: 'shadow-orange-700/5',
  },
] as const;

export function TournamentEmptyLeaderboard({ tournament }: { tournament: TournamentSummary }) {
  const { t } = useTranslation();
  const sorted = [...tournament.prizes].sort((a, b) => a.rankFrom - b.rankFrom);
  const topThree = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  return (
    <div className="space-y-6">
      <div className="rounded-[2.5rem] border border-amber-500/20 bg-gradient-to-br from-amber-950/30 via-slate-900/60 to-slate-900/80 p-8 text-center relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #f59e0b, transparent 70%)' }}
        />
        <Trophy className="h-14 w-14 text-amber-400/60 mx-auto mb-4 drop-shadow-lg" />
        <h3 className="text-xl font-black text-white mb-1">{t('tournaments.empty.noParticipants')}</h3>
        <p className="text-slate-400 text-sm max-w-sm mx-auto">{t('tournaments.empty.beFirst')}</p>
        <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-black px-3 py-1 rounded-full">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            LIVE
          </span>
          <span className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold px-3 py-1 rounded-full">
            <Gift className="w-3 h-3" />
            {t(sorted.length === 1 ? 'tournaments.ui.prizes_available_one' : 'tournaments.ui.prizes_available_other', {
              count: sorted.length,
            })}
          </span>
        </div>
      </div>

      {topThree.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          {topThree.map((prize, index) => {
            const slot = PODIUM_SLOTS[index];
            return (
              <div
                key={prize.id}
                className={`${slot.order} rounded-[2rem] border ${slot.border} bg-gradient-to-b ${slot.bg} overflow-hidden relative shadow-xl ${slot.glow} ${slot.height} flex flex-col`}
              >
                <div className={`absolute top-0 inset-x-0 h-1 ${slot.bar}`} />
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-700/60 flex items-center justify-center bg-slate-800/40 mb-1">
                    <span className="text-2xl opacity-60">?</span>
                  </div>
                  <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">
                    {t(slot.labelKey)}
                  </p>
                  <p className="text-xs text-slate-600 italic">{t('tournaments.ui.nobody_yet')}</p>
                  <div className="mt-auto pt-2 w-full px-2">
                    <TournamentPrizeCard prize={prize} />
                  </div>
                </div>
                <div className="absolute top-3 left-3">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shadow ${slot.medalBg}`}
                  >
                    {slot.rank}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {rest.length > 0 ? (
        <div className="rounded-[1.5rem] border border-white/5 bg-slate-900/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
            <Gift className="w-4 h-4 text-amber-400/70" />
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
              {t('tournaments.ui.other_prizes')}
            </span>
          </div>
          <ul className="divide-y divide-white/[0.04] py-1">
            {rest.map((prize) => (
              <li key={prize.id} className="px-2">
                <TournamentPrizeCard prize={prize} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="text-center py-4">
        <p className="text-xs text-slate-600">{t('tournaments.ui.empty_podium_hint')}</p>
      </div>
    </div>
  );
}
