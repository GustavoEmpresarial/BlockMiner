import { useTranslation } from 'react-i18next';
import type { EarningsUiFilter } from '../../lib/stats.config';

const FILTERS: EarningsUiFilter[] = ['today', '7d', '30d', '90d', 'all'];

type Props = {
  value: EarningsUiFilter;
  onChange: (v: EarningsUiFilter) => void;
};

export default function PeriodPills({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
            value === p
              ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-[2px_2px_0px_#000000]'
              : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:text-white hover:border-slate-600'
          }`}
        >
          {t(`powerStats.dashboard.period.${p}`)}
        </button>
      ))}
    </div>
  );
}
