import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import type { CheckinStatusPayload } from '../lib/checkin.types';
import { isValidHistoryDateKey } from '../lib/checkinHelpers';

export function CheckinHistorySection({ recentCheckins }: { recentCheckins: CheckinStatusPayload['recentCheckins'] }) {
  const { t } = useTranslation();
  const entries = (recentCheckins ?? []).filter((row) => row && isValidHistoryDateKey(row.date));
  if (entries.length === 0) return null;

  return (
    <div className="bg-surface border border-gray-800/50 rounded-[2rem] p-8 shadow-xl">
      <h3 className="text-sm font-bold text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
        <History className="w-4 h-4 text-amber-500" />
        {t('checkin.history_title')}
      </h3>
      <ul className="flex flex-wrap gap-2">
        {entries.map((row) => (
          <li
            key={row.date}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-emerald-400/90"
            title={
              row.paymentMethod
                ? `${row.paymentMethod}${row.usedGrace ? ' · grace' : ''}${row.usedFreeze ? ' · freeze' : ''}`
                : undefined
            }
          >
            {row.date}
          </li>
        ))}
      </ul>
    </div>
  );
}
