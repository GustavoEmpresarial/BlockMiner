import { useTranslation } from 'react-i18next';
import { Pencil, Eye, RotateCw } from 'lucide-react';
import type { AdminTournament } from '../tournaments.admin.types';
import { TYPE_BADGE_STYLE, STATUS_BADGE_STYLE } from './TournamentCard';

export interface TournamentSeriesCardProps {
  tournament: AdminTournament;
  onEdit: (tournament: AdminTournament) => void;
  onInspect: (tournament: AdminTournament) => void;
}

export function TournamentSeriesCard({
  tournament,
  onEdit,
  onInspect,
}: TournamentSeriesCardProps) {
  const { t } = useTranslation();
  const typeCfg = TYPE_BADGE_STYLE[tournament.type] || TYPE_BADGE_STYLE.CUSTOM;
  const statusCfg = STATUS_BADGE_STYLE[tournament.status] || STATUS_BADGE_STYLE.ACTIVE;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-4 hover:border-slate-700/80 transition-colors">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-bold text-slate-500">#{tournament.id}</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${typeCfg.style}`}
          >
            {typeCfg.label}
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${statusCfg.style}`}
          >
            {statusCfg.label}
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-md">
            <RotateCw className="w-2.5 h-2.5" />
            {tournament.metric}
          </span>
        </div>

        <h4 className="truncate text-sm font-bold text-white">{tournament.name}</h4>

        <p className="text-[11px] text-slate-500 font-mono">
          {new Date(tournament.startsAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          →{' '}
          {new Date(tournament.endsAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
        <button
          type="button"
          onClick={() => onEdit(tournament)}
          className="inline-flex items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          {t('adminTournaments.edit_series')}
        </button>

        <button
          type="button"
          onClick={() => onInspect(tournament)}
          className="inline-flex items-center gap-1 rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <Eye className="w-3.5 h-3.5" />
          {t('adminTournaments.inspect')}
        </button>
      </div>
    </div>
  );
}
