import { useTranslation } from 'react-i18next';
import { History } from 'lucide-react';
import type { CheckinStatusPayload } from '../lib/checkin.types';
import { isValidHistoryDateKey } from '../lib/checkinHelpers';
import Card from '../../../shared/components/Card';
import SectionHeader from '../../../shared/components/SectionHeader';

export function CheckinHistorySection({ recentCheckins }: { recentCheckins: CheckinStatusPayload['recentCheckins'] }) {
  const { t } = useTranslation();
  const entries = (recentCheckins ?? []).filter((row) => row && isValidHistoryDateKey(row.date));
  if (entries.length === 0) return null;

  return (
    <Card className="p-6 sm:p-8 space-y-5">
      <SectionHeader icon={History} iconVariant="amber" title={t('checkin.history_title')} />
      <ul className="flex flex-wrap gap-2 pt-1">
        {entries.map((row) => (
          <li
            key={row.date}
            className="px-3 py-1.5 rounded-xl bg-slate-950 border-2 border-slate-800 text-xs font-mono font-bold text-emerald-400 shadow-[1px_1px_0px_#000000]"
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
    </Card>
  );
}
