import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { formatHashrate } from '../../../shared/utils/machine';
// formatDurationMs/progressPercent used to be reimplemented here byte-for-byte identical
// to ExpiryProgressList's — same boost-expiry math rendered as a table instead of a list.
import { formatDurationMs, progressPercentAt, type ExpiryRow } from './ExpiryProgressList';

function progressPercent(playedAt: string | null | undefined, expiresAt: string | null | undefined): number {
  return progressPercentAt(playedAt, expiresAt, Date.now());
}

type Props = {
  rows: ExpiryRow[];
};

function BoostsTableInner({ rows }: Props) {
  const { t } = useTranslation();
  const [, bump] = useState(0);
  useEffect(() => {
    const id = setInterval(() => bump((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt))),
    [rows],
  );

  if (sorted.length === 0) {
    return <p className="text-sm text-slate-600">{t('powerStats.no_active_temporary')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/40">
      <table className="w-full text-sm text-left min-w-[720px]">
        <thead className="text-[10px] uppercase text-slate-500 font-black tracking-widest border-b border-slate-800">
          <tr>
            <th className="p-3">{t('powerStats.dashboard.col_source')}</th>
            <th className="p-3">{t('powerStats.dashboard.col_name')}</th>
            <th className="p-3">{t('powerStats.dashboard.col_power')}</th>
            <th className="p-3">{t('powerStats.dashboard.col_expires')}</th>
            <th className="p-3 min-w-[140px]">{t('powerStats.dashboard.col_progress')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {sorted.map((row, idx) => {
            const end = row.expiresAt ? new Date(row.expiresAt).getTime() : 0;
            // eslint-disable-next-line react-hooks/purity -- reads the wall clock to compute time remaining; table re-renders on an interval.
            const left = end - Date.now();
            const expired = left <= 0;
            const pct = progressPercent(row.playedAt, row.expiresAt);
            return (
              <tr key={`${row.source}-${row.slug}-${idx}`} className="hover:bg-slate-800/20">
                <td className="p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded-md">
                    {row.source}
                  </span>
                </td>
                <td className="p-3 font-medium text-white">{row.name}</td>
                <td className="p-3 font-mono text-sky-400">{formatHashrate(row.hashRate)}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border ${
                      expired
                        ? 'text-red-400 bg-red-500/10 border-red-500/20'
                        : 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    }`}
                  >
                    <Timer className="w-3 h-3" />
                    {expired ? t('powerStats.expired') : formatDurationMs(left)}
                  </span>
                </td>
                <td className="p-3">
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ${expired ? 'bg-red-500/60' : 'bg-gradient-to-r from-amber-500 to-orange-400'}`}
                      style={{ width: `${expired ? 100 : pct}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default memo(BoostsTableInner);
