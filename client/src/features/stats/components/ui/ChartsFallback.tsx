import { useTranslation } from 'react-i18next';

export default function ChartsFallback({ cols = 2 }: { cols?: 1 | 2 }) {
  const { t } = useTranslation();
  return (
    <div
      className={`grid grid-cols-1 ${cols === 2 ? 'xl:grid-cols-2' : ''} gap-6`}
      role="status"
      aria-busy="true"
      aria-label={t('powerStats.charts_loading')}
    >
      <div className="h-[280px] rounded-3xl border-2 border-slate-800 bg-slate-900/60 shadow-[4px_4px_0px_#000000] animate-pulse" />
      {cols === 2 ? <div className="h-[280px] rounded-3xl border-2 border-slate-800 bg-slate-900/60 shadow-[4px_4px_0px_#000000] animate-pulse" /> : null}
    </div>
  );
}
