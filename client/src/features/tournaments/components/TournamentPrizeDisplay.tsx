import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Cpu, Gift, Zap } from 'lucide-react';
import type { TournamentPrize } from '../lib/tournaments.types';
import { formatHashrate } from '../../ranking/lib/ranking.utils';
import {
  formatTournamentPrizeLabel,
  formatTournamentTokenAmount,
} from '../lib/formatTournamentPrize';
import { prizeRankBadgeClass } from '../lib/tournamentMetricDisplay';

function PrizeRankBadge({ prize }: { prize: TournamentPrize }) {
  const label =
    prize.rankFrom === prize.rankTo ? `#${prize.rankFrom}` : `#${prize.rankFrom}–${prize.rankTo}`;
  return (
    <span
      className={`shrink-0 inline-flex h-7 min-w-[2rem] items-center justify-center rounded-lg px-2 font-black text-[10px] shadow ${prizeRankBadgeClass(prize.rankFrom)}`}
    >
      {label}
    </span>
  );
}

export function TournamentPrizeCard({ prize }: { prize: TournamentPrize }) {
  const { t } = useTranslation();

  if (prize.prizeType === 'MACHINE') {
    const name = prize.miner?.name ?? prize.minerName ?? t('tournaments.admin.machine');
    const count = prize.minerCount ?? 1;
    const hr = prize.miner?.baseHashRate;
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/15 bg-slate-900/60 p-2 pr-3 hover:border-amber-500/30 transition-colors">
        <PrizeRankBadge prize={prize} />
        <div className="shrink-0 w-10 h-10 rounded-lg bg-slate-800 border border-white/10 overflow-hidden flex items-center justify-center">
          {prize.miner?.imageUrl ? (
            <img src={prize.miner.imageUrl} alt="" className="w-full h-full object-contain p-0.5" />
          ) : (
            <Cpu className="w-4 h-4 text-slate-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-white truncate leading-tight">{name}</p>
          {hr != null ? (
            <p className="text-[10px] text-amber-300/90 font-mono mt-0.5 flex items-center gap-1">
              <Zap className="w-2.5 h-2.5" />
              {formatHashrate(hr)}
            </p>
          ) : null}
        </div>
        {count > 1 ? (
          <span className="shrink-0 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-black text-amber-300">
            ×{count}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-slate-900/40 border border-white/5 px-2 py-2">
      <PrizeRankBadge prize={prize} />
      <span className="text-xs text-slate-200 font-bold">{formatTournamentPrizeLabel(prize, t)}</span>
    </div>
  );
}

function PrizeListRow({ prize }: { prize: TournamentPrize }) {
  const { t } = useTranslation();
  const label =
    prize.prizeType === 'MACHINE'
      ? `${(prize.minerCount ?? 1) > 1 ? `${prize.minerCount}× ` : ''}${prize.miner?.name ?? prize.minerName ?? t('tournaments.admin.machine')}`
      : formatTournamentPrizeLabel(prize, t);
  const rankLabel =
    prize.rankFrom === prize.rankTo ? `#${prize.rankFrom}` : `#${prize.rankFrom}–${prize.rankTo}`;

  return (
    <li className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-white/[0.03] transition-colors">
      <span
        className={`shrink-0 inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 font-black text-[9px] ${prizeRankBadgeClass(prize.rankFrom)}`}
      >
        {rankLabel}
      </span>
      <span className="min-w-0 flex-1 truncate text-slate-300">{label}</span>
      {prize.prizeType === 'MACHINE' && prize.miner?.baseHashRate != null ? (
        <span className="shrink-0 text-[10px] font-mono text-amber-400/70">
          {formatHashrate(prize.miner.baseHashRate)}
        </span>
      ) : null}
    </li>
  );
}

export function TournamentPrizesPanel({ prizes }: { prizes: TournamentPrize[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (prizes.length === 0) {
    return <p className="text-xs text-slate-600">{t('tournaments.noPrizes')}</p>;
  }

  const sorted = [...prizes].sort((a, b) => a.rankFrom - b.rankFrom);
  const topThree = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  return (
    <div className="space-y-2">
      {topThree.map((p) => (
        <TournamentPrizeCard key={p.id} prize={p} />
      ))}
      {rest.length > 0 ? (
        <div className="rounded-xl border border-white/5 bg-slate-900/40 overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-[10px] uppercase tracking-widest font-mono text-slate-500 hover:text-slate-300 transition-colors"
          >
            <span>{t('tournaments.moreTiers', { count: rest.length })}</span>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expanded ? (
            <ul className="divide-y divide-white/[0.04] border-t border-white/5">
              {rest.map((p) => (
                <PrizeListRow key={p.id} prize={p} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TournamentPrizeInline({ prize }: { prize: TournamentPrize }) {
  const { t } = useTranslation();

  if (prize.prizeType === 'MACHINE') {
    const name = prize.miner?.name ?? prize.minerName ?? t('tournaments.admin.machine');
    const count = prize.minerCount ?? 1;
    return (
      <div className="inline-flex items-center gap-3 rounded-xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-500/5 pl-2 pr-4 py-2 shadow-md shadow-amber-500/10">
        <div className="w-12 h-12 rounded-lg bg-slate-900 border border-amber-500/20 overflow-hidden flex items-center justify-center shrink-0">
          {prize.miner?.imageUrl ? (
            <img src={prize.miner.imageUrl} alt="" className="w-full h-full object-contain p-1" />
          ) : (
            <Cpu className="w-5 h-5 text-slate-500" />
          )}
        </div>
        <div className="text-left leading-tight">
          <p className="text-sm font-black text-amber-100 truncate max-w-[180px] flex items-center gap-1.5">
            {count > 1 ? (
              <span className="shrink-0 rounded-md bg-amber-500/25 px-1.5 py-0.5 text-[11px] font-black text-amber-200">
                ×{count}
              </span>
            ) : null}
            {name}
          </p>
          {prize.miner?.baseHashRate != null ? (
            <p className="text-[11px] text-amber-400 font-mono font-bold mt-0.5 flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {formatHashrate(prize.miner.baseHashRate)}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/15 to-amber-500/5 px-4 py-2 text-sm font-black text-amber-100 shadow-md shadow-amber-500/10">
      <Gift className="w-4 h-4 text-amber-400" />
      {formatTournamentPrizeLabel(prize, t)}
    </span>
  );
}
