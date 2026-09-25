import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Pencil, CheckCircle2, XCircle, RotateCw, Users } from 'lucide-react';
import type { AdminTournament, TournamentStatus, TournamentType } from '../tournaments.admin.types';

export const TYPE_BADGE_STYLE: Record<TournamentType, { label: string; style: string }> = {
  DAILY: { label: 'Diário', style: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  WEEKLY: { label: 'Semanal', style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  MONTHLY: { label: 'Mensal', style: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  CUSTOM: { label: 'Custom', style: 'bg-slate-800 text-slate-400 border-slate-700' },
};

export const STATUS_BADGE_STYLE: Record<TournamentStatus, { label: string; style: string }> = {
  ACTIVE: { label: 'Ativo', style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  SCHEDULED: { label: 'Agendado', style: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  ENDED: { label: 'Encerrado', style: 'bg-slate-800/80 text-slate-500 border-slate-700' },
  CANCELLED: { label: 'Cancelado', style: 'bg-red-500/10 text-red-400 border-red-500/20' },
};

export interface TournamentCardProps {
  tournament: AdminTournament;
  onInspect: (tournament: AdminTournament) => void;
  onEdit: (tournament: AdminTournament) => void;
  onFinalize: (tournament: AdminTournament) => void | Promise<void>;
  onCancel: (tournament: AdminTournament) => void | Promise<void>;
}

export function TournamentCard({
  tournament,
  onInspect,
  onEdit,
  onFinalize,
  onCancel,
}: TournamentCardProps) {
  const { t } = useTranslation();
  const [confirmAction, setConfirmAction] = useState<'finalize' | 'cancel' | null>(null);

  const editable = tournament.status === 'ACTIVE' || tournament.status === 'SCHEDULED';
  const typeCfg = TYPE_BADGE_STYLE[tournament.type] || TYPE_BADGE_STYLE.CUSTOM;
  const statusCfg = STATUS_BADGE_STYLE[tournament.status] || STATUS_BADGE_STYLE.ENDED;

  const entriesCount = tournament._count?.entries ?? 0;
  const prizesCount = tournament.prizes?.length ?? 0;

  return (
    <div
      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border transition-all ${
        tournament.status === 'ACTIVE'
          ? 'bg-slate-900 border-slate-700/80 shadow-sm'
          : tournament.status === 'SCHEDULED'
            ? 'bg-slate-900/90 border-sky-900/40'
            : 'bg-slate-950/60 border-slate-800/80 opacity-70'
      }`}
    >
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-black text-amber-400/80">#{tournament.id}</span>

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

          {tournament.recurring ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-500/20 bg-amber-500/10 text-amber-400">
              <RotateCw className="w-2.5 h-2.5" />
              Recorrente
            </span>
          ) : null}

          <span className="font-mono text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700">
            {tournament.metric}
          </span>
        </div>

        <h3 className="text-sm font-bold text-white truncate">{tournament.name}</h3>

        {tournament.description ? (
          <p className="text-xs text-slate-400 line-clamp-1">{tournament.description}</p>
        ) : null}

        <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500 font-mono">
          <span>
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
          </span>

          <span className="flex items-center gap-1 text-slate-400 font-sans">
            <Users className="w-3 h-3 text-slate-500" />
            {entriesCount} {entriesCount === 1 ? 'participante' : 'participantes'}
          </span>

          <span className="text-slate-400 font-sans">
            {prizesCount} {prizesCount === 1 ? 'faixa de prêmio' : 'faixas de prêmio'}
          </span>
        </div>
      </div>

      {/* Ações com confirmação inline (sem window.confirm) */}
      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        {confirmAction === 'finalize' ? (
          <div className="flex items-center gap-1.5 bg-amber-950/70 border border-amber-800/80 px-2.5 py-1.5 rounded-xl">
            <span className="text-[11px] font-bold text-amber-200">
              Finalizar e premiar vencedores?
            </span>
            <button
              type="button"
              onClick={async () => {
                setConfirmAction(null);
                await onFinalize(tournament);
              }}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-black transition-colors"
            >
              Sim, finalizar
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-colors"
            >
              Voltar
            </button>
          </div>
        ) : confirmAction === 'cancel' ? (
          <div className="flex items-center gap-1.5 bg-red-950/70 border border-red-800/80 px-2.5 py-1.5 rounded-xl">
            <span className="text-[11px] font-bold text-red-200">Cancelar este torneio?</span>
            <button
              type="button"
              onClick={async () => {
                setConfirmAction(null);
                await onCancel(tournament);
              }}
              className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold transition-colors"
            >
              Sim, cancelar
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-colors"
            >
              Voltar
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onInspect(tournament)}
              className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
              title="Inspecionar detalhes e leaderboard"
              aria-label="Inspecionar torneio"
            >
              <Eye className="w-4 h-4" />
            </button>

            {editable ? (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(tournament)}
                  className="p-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                  title="Editar torneio"
                  aria-label="Editar torneio"
                >
                  <Pencil className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmAction('finalize')}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 text-xs font-bold transition-colors"
                  title="Finalizar torneio e distribuir prêmios"
                  aria-label="Finalizar torneio"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Finalizar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmAction('cancel')}
                  className="p-2 rounded-xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Cancelar torneio"
                  aria-label="Cancelar torneio"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
