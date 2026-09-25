import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X, Users, Calendar, Trophy, AlertTriangle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { resolveApiErrorMessage } from '../../../../shared/utils/apiErrorI18n';
import { tournamentsAdminApi } from '../tournaments.admin.api';
import type { AdminTournament, TournamentEntryRow } from '../tournaments.admin.types';
import { formatTournamentTokenAmount } from '../../../tournaments/lib/formatTournamentPrize';
import { TYPE_BADGE_STYLE, STATUS_BADGE_STYLE } from './TournamentCard';

function formatPrize(p: AdminTournament['prizes'][number]): string {
  const range = p.rankFrom === p.rankTo ? `#${p.rankFrom}` : `#${p.rankFrom}–${p.rankTo}`;
  if (p.prizeType === 'POL') return `${range}: ${p.polAmount ?? 0} POL`;
  if (p.prizeType === 'BLK') return `${range}: ${formatTournamentTokenAmount(p.blkAmount)} BLK`;
  if (p.prizeType === 'MINING_BOOST') return `${range}: ${p.boostHashRate ?? 0} H/s × ${p.boostHours ?? 0}h`;
  if (p.prizeType === 'MACHINE') {
    const name = p.miner?.name ?? (p.minerId ? `#${p.minerId}` : '—');
    return `${range}: ${p.minerCount ?? 1}× ${name}`;
  }
  return `${range}: ${p.prizeType}`;
}

export interface TournamentInspectPanelProps {
  tournament: AdminTournament;
  onClose: () => void;
  onChanged: () => void;
}

export function TournamentInspectPanel({
  tournament,
  onClose,
  onChanged,
}: TournamentInspectPanelProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<TournamentEntryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'finalize' | 'cancel' | null>(null);

  const loadEntries = useCallback(async (targetPage: number, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const { data } = await tournamentsAdminApi.entries(tournament.id, targetPage);
      if (!data.ok) throw new Error(data.message);
      const newEntries = data.entries ?? [];
      setEntries((prev) => (append ? [...prev, ...newEntries] : newEntries));
      setTotal(data.total ?? 0);
      setPage(targetPage);
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, t('adminManaged.load_error')));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tournament.id, t]);

  useEffect(() => {
    void loadEntries(1, false);
  }, [loadEntries]);

  const handleLoadMore = () => {
    if (loadingMore || entries.length >= total) return;
    void loadEntries(page + 1, true);
  };

  const executeAction = async (action: 'finalize' | 'cancel') => {
    setBusy(true);
    setConfirmAction(null);
    try {
      const { data } =
        action === 'finalize'
          ? await tournamentsAdminApi.finalize(tournament.id)
          : await tournamentsAdminApi.cancel(tournament.id);
      if (!data.ok) throw new Error(data.message);
      toast.success(
        action === 'finalize'
          ? t('adminTournaments.finalized', {
              ranked: 'ranked' in data ? data.ranked ?? 0 : 0,
              rewarded: 'rewarded' in data ? data.rewarded ?? 0 : 0,
            })
          : t('adminTournaments.cancelled'),
      );
      onChanged();
      onClose();
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, t('adminManaged.action_error')));
    } finally {
      setBusy(false);
    }
  };

  const canAct = tournament.status === 'ACTIVE' || tournament.status === 'SCHEDULED';
  const typeCfg = TYPE_BADGE_STYLE[tournament.type] || TYPE_BADGE_STYLE.CUSTOM;
  const statusCfg = STATUS_BADGE_STYLE[tournament.status] || STATUS_BADGE_STYLE.ENDED;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <button
        type="button"
        className="flex-1 cursor-default"
        aria-label={t('adminTournaments.close')}
        onClick={onClose}
      />
      <aside className="flex h-full w-full max-w-lg flex-col border-l border-slate-800 bg-slate-950 shadow-2xl animate-in slide-in-from-right duration-300">
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 p-5">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-bold text-amber-400">#{tournament.id}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${typeCfg.style}`}>
                {typeCfg.label}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${statusCfg.style}`}>
                {statusCfg.label}
              </span>
              <span className="font-mono text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700">
                {tournament.metric}
              </span>
            </div>
            <h3 className="truncate text-lg font-black text-white">{tournament.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {tournament.description ? (
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-3">
              <p className="text-xs text-slate-300 leading-relaxed">{tournament.description}</p>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              {t('adminTournaments.window')}
            </p>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 font-mono text-xs text-slate-300 flex items-center justify-between gap-2 flex-wrap">
              <span>{new Date(tournament.startsAt).toLocaleString('pt-BR')}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
              <span>{new Date(tournament.endsAt).toLocaleString('pt-BR')}</span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              {t('adminTournaments.prizes')} ({tournament.prizes.length})
            </p>
            {tournament.prizes.length === 0 ? (
              <p className="text-xs text-slate-500 rounded-xl border border-dashed border-slate-800 p-4 text-center">
                Nenhum prêmio configurado
              </p>
            ) : (
              <ul className="space-y-1.5">
                {tournament.prizes.map((p, i) => (
                  <li
                    key={p.id ?? i}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2 text-xs text-slate-200"
                  >
                    <span>{formatPrize(p)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                {t('adminTournaments.entries')} ({total})
              </p>
              {entries.length > 0 ? (
                <span className="text-[10px] font-mono text-slate-500">
                  Mostrando {entries.length} de {total}
                </span>
              ) : null}
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            ) : entries.length === 0 ? (
              <p className="text-xs text-slate-500 rounded-xl border border-dashed border-slate-800 p-6 text-center">
                {t('adminTournaments.entries_empty')}
              </p>
            ) : (
              <div className="space-y-2">
                <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/90 text-[10px] uppercase text-slate-500 border-b border-slate-800">
                      <tr>
                        <th className="px-3 py-2.5">#</th>
                        <th className="px-3 py-2.5">{t('adminTournaments.player')}</th>
                        <th className="px-3 py-2.5 text-right">{t('adminTournaments.score')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {entries.map((e, i) => (
                        <tr key={e.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-3 py-2 font-mono text-slate-500 font-bold">
                            {e.rank ?? i + 1}
                          </td>
                          <td className="px-3 py-2 text-slate-200 font-medium">
                            {e.user?.username ?? e.user?.id ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-amber-300">
                            {e.score}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {entries.length < total ? (
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={handleLoadMore}
                    className="w-full py-2 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900 text-xs font-bold text-slate-300 transition-colors flex items-center justify-center gap-2"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando mais...
                      </>
                    ) : (
                      `Carregar mais (${total - entries.length} restantes)`
                    )}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {canAct ? (
          <footer className="border-t border-slate-800 p-5 bg-slate-950/80">
            {confirmAction === 'finalize' ? (
              <div className="space-y-2 p-3 bg-amber-950/50 border border-amber-800/80 rounded-xl">
                <p className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  Finalizar torneio e distribuir prêmios agora?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void executeAction('finalize')}
                    className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-colors disabled:opacity-50"
                  >
                    {busy ? 'Processando…' : 'Sim, finalizar'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmAction(null)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            ) : confirmAction === 'cancel' ? (
              <div className="space-y-2 p-3 bg-red-950/50 border border-red-800/80 rounded-xl">
                <p className="text-xs font-bold text-red-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  Cancelar torneio? Essa ação não pode ser desfeita.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void executeAction('cancel')}
                    className="flex-1 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-black transition-colors disabled:opacity-50"
                  >
                    {busy ? 'Cancelando…' : 'Sim, cancelar'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmAction(null)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmAction('finalize')}
                  className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950 transition-colors disabled:opacity-50 shadow-md shadow-amber-500/10"
                >
                  {t('adminTournaments.finalize')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmAction('cancel')}
                  className="flex-1 rounded-xl border border-red-500/30 hover:bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-300 transition-colors disabled:opacity-50"
                >
                  {t('adminTournaments.cancel')}
                </button>
              </div>
            )}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
