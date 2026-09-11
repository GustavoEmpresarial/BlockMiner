import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { resolveApiErrorMessage } from '../../../shared/utils/apiErrorI18n';
import { tournamentsAdminApi } from './tournaments.admin.api';
import type { AdminTournament, TournamentEntryRow } from './tournaments.admin.types';
import { formatTournamentTokenAmount } from '../../tournaments/lib/formatTournamentPrize';

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

export default function TournamentInspectPanel({
  tournament,
  onClose,
  onChanged,
}: {
  tournament: AdminTournament;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<TournamentEntryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await tournamentsAdminApi.entries(tournament.id, 1);
      if (!data.ok) throw new Error(data.message);
      setEntries(data.entries ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, t('adminManaged.load_error')));
    } finally {
      setLoading(false);
    }
  }, [tournament.id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: 'finalize' | 'cancel') => {
    const confirmKey =
      action === 'finalize' ? 'adminTournaments.confirm_finalize' : 'adminTournaments.confirm_cancel';
    if (!confirm(t(confirmKey))) return;
    setBusy(true);
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
      <button type="button" className="flex-1" aria-label={t('adminTournaments.close')} onClick={onClose} />
      <aside className="flex h-full w-full max-w-lg flex-col border-l border-slate-800 bg-slate-950 shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">#{tournament.id}</p>
            <h3 className="truncate text-lg font-black text-white">{tournament.name}</h3>
            <p className="mt-1 text-xs text-slate-400">
              {tournament.type} · {tournament.metric} · {tournament.status}
              {tournament.recurring ? ` · ${t('adminTournaments.recurring')}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {tournament.description ? (
            <p className="text-sm text-slate-300">{tournament.description}</p>
          ) : null}

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('adminTournaments.window')}</p>
            <p className="font-mono text-xs text-slate-300">
              {new Date(tournament.startsAt).toLocaleString()} → {new Date(tournament.endsAt).toLocaleString()}
            </p>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('adminTournaments.prizes')}</p>
            {tournament.prizes.length === 0 ? (
              <p className="text-xs text-slate-500">—</p>
            ) : (
              <ul className="space-y-1">
                {tournament.prizes.map((p, i) => (
                  <li key={p.id ?? i} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-200">
                    {formatPrize(p)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {t('adminTournaments.entries')} ({total})
            </p>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
              </div>
            ) : entries.length === 0 ? (
              <p className="text-xs text-slate-500">{t('adminTournaments.entries_empty')}</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">{t('adminTournaments.player')}</th>
                      <th className="px-3 py-2 text-right">{t('adminTournaments.score')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {entries.map((e, i) => (
                      <tr key={e.id}>
                        <td className="px-3 py-2 font-mono text-slate-500">{e.rank ?? i + 1}</td>
                        <td className="px-3 py-2 text-slate-200">{e.user?.username ?? e.user?.id ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-mono text-amber-300">{e.score}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {canAct ? (
          <footer className="flex gap-2 border-t border-slate-800 px-5 py-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('finalize')}
              className="flex-1 rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50"
            >
              {t('adminTournaments.finalize')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run('cancel')}
              className="flex-1 rounded-xl border border-red-500/30 px-3 py-2 text-xs font-bold text-red-300 disabled:opacity-50"
            >
              {t('adminTournaments.cancel')}
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
