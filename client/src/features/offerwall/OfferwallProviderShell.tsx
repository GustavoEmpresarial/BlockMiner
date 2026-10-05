/**
 * Shared Offerwall provider chrome — same UX for every external wall:
 * Stats tab (totals + periods + history) | Offers tab (iframe or partner open).
 */
import { type ReactNode } from 'react';
import { ChevronLeft, ExternalLink, Loader2, type LucideIcon } from 'lucide-react';
import Card from '../../shared/components/Card';
import IconBadge from '../../shared/components/IconBadge';
import SectionHeader from '../../shared/components/SectionHeader';
import { t } from './lib/offerwall.i18n';

export type OfferwallTab = 'stats' | 'offers';

export type OfferwallAccent = {
  border: string;
  headerBg: string;
  iconBg: string;
  iconText: string;
  tabActive: string;
  periodBorder: string;
  periodBg: string;
  periodText: string;
  cta: string;
};

/** One shared palette — site primary brand (`#3B82F6`). */
export const OFFERWALL_SHARED_ACCENT: OfferwallAccent = {
  border: 'border-primary/25',
  headerBg: 'bg-primary/10',
  iconBg: 'bg-primary/20',
  iconText: 'text-primary',
  tabActive: 'border-primary bg-primary/20 text-white shadow-[2px_2px_0px_#000000]',
  periodBorder: 'border-primary/30',
  periodBg: 'bg-primary/10',
  periodText: 'text-primary',
  cta: 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5',
};

/** Kept as named keys so call sites stay stable — all resolve to the shared brand palette. */
export const OFFERWALL_ACCENTS = {
  purple: OFFERWALL_SHARED_ACCENT,
  violet: OFFERWALL_SHARED_ACCENT,
  amber: OFFERWALL_SHARED_ACCENT,
  cyan: OFFERWALL_SHARED_ACCENT,
  emerald: OFFERWALL_SHARED_ACCENT,
} as const satisfies Record<string, OfferwallAccent>;

export type OfferwallStatCard = { label: string; value: string };
export type OfferwallPeriodCard = { label: string; valueLabel: string };
export type OfferwallHistoryColumn = {
  key: string;
  header: string;
  align?: 'left' | 'right';
  cellClassName?: string;
  render: (row: Record<string, unknown>) => ReactNode;
};

type Props = {
  onBack: () => void;
  title: string;
  tagline: string;
  accent: OfferwallAccent;
  Icon: LucideIcon;
  backLabel: string;
  tab: OfferwallTab;
  onTabChange: (tab: OfferwallTab) => void;
  statsCards: OfferwallStatCard[] | null;
  periodCards: OfferwallPeriodCard[] | null;
  howItWorks: string;
  rateNote?: string;
  openOffersLabel: string;
  historyTitle: string;
  historyEmpty: string;
  historyRecent?: string | null;
  historyColumns: OfferwallHistoryColumn[];
  historyRows: Record<string, unknown>[] | null;
  historyLoading: boolean;
  offersContent: ReactNode;
  banner?: ReactNode;
};

export function OfferwallProviderShell({
  onBack,
  title,
  tagline,
  accent,
  Icon,
  backLabel,
  tab,
  onTabChange,
  statsCards,
  periodCards,
  howItWorks,
  rateNote,
  openOffersLabel,
  historyTitle,
  historyEmpty,
  historyRecent,
  historyColumns,
  historyRows,
  historyLoading,
  offersContent,
  banner,
}: Props) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3 min-w-0">
          <IconBadge icon={Icon} variant="primary" size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">{title}</h1>
            <p className="text-slate-400 text-xs sm:text-sm font-medium">{tagline}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border-2 border-slate-700 text-xs font-black uppercase tracking-wider text-slate-300 hover:text-white hover:border-slate-500 active:translate-x-0.5 active:translate-y-0.5 shadow-[2px_2px_0px_#000000] transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary w-fit"
        >
          <ChevronLeft className="w-4 h-4" />
          {backLabel}
        </button>
      </div>

      <div role="tablist" className="grid grid-cols-2 gap-2 max-w-full">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'stats'}
          onClick={() => onTabChange('stats')}
          className={`rounded-xl border-2 px-3 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            tab === 'stats'
              ? accent.tabActive
              : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:text-white'
          }`}
        >
          {t('offerwall.panel.tab_stats')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'offers'}
          onClick={() => onTabChange('offers')}
          className={`rounded-xl border-2 px-3 py-2.5 text-[10px] sm:text-xs font-black uppercase tracking-wider transition-all outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            tab === 'offers'
              ? accent.tabActive
              : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-600 hover:text-white'
          }`}
        >
          {t('offerwall.panel.tab_offers')}
        </button>
      </div>

      {tab === 'stats' ? (
        <div className="space-y-4">
          {banner}
          {statsCards ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {statsCards.map((card) => (
                <div key={card.label} className="rounded-2xl border-2 border-slate-800 bg-slate-950/60 p-4 shadow-[2px_2px_0px_#000000]">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{card.label}</p>
                  <p className="text-lg font-black font-mono text-white">{card.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          {periodCards ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {periodCards.map((card) => (
                <div
                  key={card.label}
                  className={`rounded-2xl border-2 ${accent.periodBorder} ${accent.periodBg} p-4 shadow-[2px_2px_0px_#000000]`}
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{card.label}</p>
                  <p className={`text-sm font-black font-mono ${accent.periodText}`}>{card.valueLabel}</p>
                </div>
              ))}
            </div>
          ) : null}

          <Card className="space-y-3">
            <p className="text-sm text-slate-300 font-medium leading-relaxed">{howItWorks}</p>
            {rateNote ? <p className={`text-sm font-mono font-bold ${accent.periodText}`}>{rateNote}</p> : null}
            <button
              type="button"
              onClick={() => onTabChange('offers')}
              className={`w-full flex items-center justify-center gap-2 rounded-xl ${accent.cta} transition-all font-black uppercase tracking-wider text-xs py-3.5 px-6 outline-none focus-visible:ring-2 focus-visible:ring-sky-400`}
            >
              {openOffersLabel}
              <ExternalLink className="w-4 h-4" />
            </button>
          </Card>

          <Card variant="table">
            <div className="flex items-center gap-2 px-5 sm:px-6 py-4 border-b border-slate-800 bg-slate-950/40">
              <SectionHeader icon={ExternalLink} iconVariant="sky" title={historyTitle} className="flex-1 border-b-0 pb-0" />
              {historyRecent ? <span className="text-[10px] text-slate-300 font-mono font-bold">{historyRecent}</span> : null}
            </div>
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
              </div>
            ) : historyRows?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-950/90 text-[10px] uppercase tracking-widest text-slate-400 border-b-2 border-slate-800 font-mono">
                    <tr>
                      {historyColumns.map((col) => (
                        <th
                          key={col.key}
                          className={`${col.align === 'right' ? 'text-right' : 'text-left'} px-5 py-3.5`}
                        >
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-slate-800/80">
                    {historyRows.map((row) => (
                      <tr
                        key={String(row.id ?? JSON.stringify(row))}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        {historyColumns.map((col) => (
                          <td
                            key={col.key}
                            className={`px-5 py-3 font-mono ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.cellClassName ?? 'text-slate-300'}`}
                          >
                            {col.render(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-300 text-center py-8 font-medium">{historyEmpty}</p>
            )}
          </Card>
        </div>
      ) : (
        <Card variant="table">{offersContent}</Card>
      )}
    </div>
  );
}

export function fmtUsd(n: unknown): string {
  return `$${(Number(n) || 0).toFixed(4)}`;
}

export function fmtBlk(n: unknown): string {
  return `${(Number(n) || 0).toFixed(6)} BLK`;
}

export function fmtDate(raw: unknown): string {
  if (!raw) return '—';
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
