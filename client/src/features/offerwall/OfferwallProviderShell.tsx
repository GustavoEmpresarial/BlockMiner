/**
 * Shared Offerwall provider chrome — same UX for every external wall:
 * Stats tab (totals + periods + history) | Offers tab (iframe or partner open).
 */
import { type ReactNode } from 'react';
import { ChevronLeft, ExternalLink, Loader2, type LucideIcon } from 'lucide-react';
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
  tabActive: 'bg-primary text-slate-950 shadow-lg',
  periodBorder: 'border-primary/25',
  periodBg: 'bg-primary/10',
  periodText: 'text-primary',
  cta: 'bg-primary hover:opacity-90 text-slate-950',
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
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
        <ChevronLeft className="w-4 h-4" />
        {backLabel}
      </button>

      <div className={`flex items-center gap-3 rounded-2xl border ${accent.border} ${accent.headerBg} px-5 py-4`}>
        <div className={`w-12 h-12 rounded-xl ${accent.iconBg} flex items-center justify-center shrink-0`}>
          <Icon className={`w-6 h-6 ${accent.iconText}`} />
        </div>
        <div>
          <p className="font-bold text-white">{title}</p>
          <p className="text-xs text-gray-400 mt-0.5">{tagline}</p>
        </div>
      </div>

      <div
        role="tablist"
        className="grid grid-cols-2 gap-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'stats'}
          onClick={() => onTabChange('stats')}
          className={`rounded-2xl border px-4 py-3.5 text-sm font-black uppercase tracking-wider transition-all active:scale-[0.98] ${
            tab === 'stats'
              ? `${accent.tabActive} border-transparent`
              : 'border-white/15 bg-slate-900/80 text-slate-300 hover:border-white/30 hover:bg-slate-800 hover:text-white'
          }`}
        >
          {t('offerwall.panel.tab_stats')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'offers'}
          onClick={() => onTabChange('offers')}
          className={`rounded-2xl border px-4 py-3.5 text-sm font-black uppercase tracking-wider transition-all active:scale-[0.98] ${
            tab === 'offers'
              ? `${accent.tabActive} border-transparent`
              : 'border-white/15 bg-slate-900/80 text-slate-300 hover:border-white/30 hover:bg-slate-800 hover:text-white'
          }`}
        >
          {t('offerwall.panel.tab_offers')}
        </button>
      </div>

      {tab === 'stats' ? (
        <div className="space-y-4">
          {banner}
          {statsCards ? (
            <div className="grid grid-cols-3 gap-3">
              {statsCards.map((card) => (
                <div key={card.label} className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
                  <p className="text-xs text-gray-400 mb-1">{card.label}</p>
                  <p className="text-sm font-bold text-white">{card.value}</p>
                </div>
              ))}
            </div>
          ) : null}
          {periodCards ? (
            <div className="grid grid-cols-3 gap-3">
              {periodCards.map((card) => (
                <div
                  key={card.label}
                  className={`rounded-xl border ${accent.periodBorder} ${accent.periodBg} p-3 text-center`}
                >
                  <p className="text-xs text-gray-400 mb-1">{card.label}</p>
                  <p className={`text-sm font-bold ${accent.periodText}`}>{card.valueLabel}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <p className="text-sm text-gray-400">{howItWorks}</p>
            {rateNote ? <p className={`text-sm ${accent.periodText}`}>{rateNote}</p> : null}
            <button
              type="button"
              onClick={() => onTabChange('offers')}
              className={`w-full flex items-center justify-center gap-2 rounded-xl ${accent.cta} transition-colors font-black uppercase tracking-wider text-sm py-3.5 px-6`}
            >
              {openOffersLabel}
              <ExternalLink className="w-4 h-4 opacity-70" />
            </button>
          </div>

          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white">{historyTitle}</h3>
              {historyRecent ? <span className="ml-auto text-xs text-gray-500">{historyRecent}</span> : null}
            </div>
            {historyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : historyRows?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-white/5">
                      {historyColumns.map((col) => (
                        <th
                          key={col.key}
                          className={`${col.align === 'right' ? 'text-right' : 'text-left'} px-4 py-2`}
                        >
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr
                        key={String(row.id ?? JSON.stringify(row))}
                        className="border-b border-white/5 hover:bg-white/5 transition-colors"
                      >
                        {historyColumns.map((col) => (
                          <td
                            key={col.key}
                            className={`px-4 py-3 ${col.align === 'right' ? 'text-right' : 'text-left'} ${col.cellClassName ?? 'text-gray-300'}`}
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
              <p className="text-sm text-gray-500 text-center py-8">{historyEmpty}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 overflow-hidden bg-gray-900">{offersContent}</div>
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
