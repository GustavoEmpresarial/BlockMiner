import React from 'react';
import type { SyntheticEvent } from 'react';
import type { PieLabelRenderProps } from 'recharts';
import {
  Package,
  ExternalLink,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ImageIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  CATEGORY_ICONS,
  CATEGORY_STYLE,
  INCOME_STYLE,
  CategoryKey,
  TransparencyEntry,
  fmt,
  fmtMaybe,
  RechartsTooltipPayloadEntry,
} from './transparency.base';
import { useTranslation } from 'react-i18next';

export function CustomPieTooltip(props: unknown) {
  const { t } = useTranslation();
  const { active, payload } = props as {
    active?: boolean;
    payload?: readonly RechartsTooltipPayloadEntry[];
  };
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const num = typeof value === 'number' ? value : Number(value);
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-0.5">{name}</p>
      <p className="text-white font-black">{fmt(num)}<span className="text-gray-500 font-normal">{t('transparency.charts.per_month')}</span></p>
    </div>
  );
}

export function CustomBarTooltip(props: unknown) {
  const { t } = useTranslation();
  const { active, payload, label } = props as {
    active?: boolean;
    payload?: readonly RechartsTooltipPayloadEntry[];
    label?: string | number;
  };
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  const num = typeof v === 'number' ? v : Number(v);
  return (
    <div className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-0.5">{label}</p>
      <p className="text-white font-black">{fmt(num)}</p>
    </div>
  );
}

export function PieLabel(props: PieLabelRenderProps) {
  const { t } = useTranslation();
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props;
  if (percent < 0.06) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="700">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ─── UI sub-components ──────────────────────────────────────────────────────

/**
 * KPI stat card shown at the top of the portal.
 * @param {Object} props
 * @param {React.ElementType} props.icon - Lucide icon component
 * @param {string} props.label - Card title
 * @param {string|number} props.value - Main value displayed
 * @param {string} [props.sub] - Secondary line
 * @param {string} [props.accent] - Tailwind text color class
 * @param {boolean} [props.glow] - Whether to render a primary glow shadow
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = 'text-primary',
  glow = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
  glow?: boolean;
}) {
  return (
    <div
      data-testid="stat-card"
      className={`relative rounded-2xl border border-white/8 bg-white/3 p-5 flex flex-col gap-1 overflow-hidden ${glow ? 'shadow-lg shadow-primary/5' : ''}`}
    >
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-1 ${glow ? 'bg-primary/10' : 'bg-white/5'}`}>
        <Icon className={`w-4 h-4 ${accent}`} />
      </div>
      <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{label}</p>
      <p className="text-2xl font-black text-white leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

/**
 * Horizontal bar representing a single expense category weight.
 */
export function CategoryBar({
  catKey,
  monthly,
  totalMonthly,
  count,
}: {
  catKey: string;
  monthly: number;
  totalMonthly: number;
  count: number;
}) {
  const { t } = useTranslation();
  const style = CATEGORY_STYLE[catKey as CategoryKey] || CATEGORY_STYLE.misc;
  const Icon = CATEGORY_ICONS[catKey as CategoryKey] || Package;
  const pct = totalMonthly > 0 ? (monthly / totalMonthly) * 100 : 0;
  return (
    <div className="space-y-1.5" data-testid="category-bar">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: style.color + '20' }}>
            <Icon className="w-3 h-3" style={{ color: style.color }} />
          </span>
          <span className="font-bold text-gray-300">{t(`transparency.category.${catKey}`, catKey)}</span>
          <span className="text-gray-600 text-[10px]">{count}x</span>
        </div>
        <span className="font-black text-white">{fmt(monthly)}<span className="text-gray-600 text-[10px] ml-0.5">{t('transparency.charts.per_month')}</span></span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: style.color }} />
      </div>
    </div>
  );
}

/**
 * Card for a single income / sponsorship entry.
 * Renders an image preview when available.
 */
export function IncomeCard({ entry }: { entry: TransparencyEntry }) {
  const { t } = useTranslation();
  type IncomeKey = keyof typeof INCOME_STYLE;
  const rawIc = entry.incomeCategory;
  const incomeMeta =
    rawIc && rawIc in INCOME_STYLE ? INCOME_STYLE[rawIc as IncomeKey] : INCOME_STYLE.other;
  const periodKey = entry.period in { daily: 1, monthly: 1, annual: 1, one_time: 1 } ? entry.period : 'monthly';

  return (
    <div
      data-testid="income-card"
      className="rounded-2xl border border-emerald-500/15 bg-emerald-950/20 overflow-hidden flex flex-col"
    >
      {entry.imageUrl ? (
        <div className="w-full bg-black/20 overflow-hidden" style={{ aspectRatio: '16/7' }}>
          <img
            src={entry.imageUrl}
            alt={entry.name}
            className="w-full h-full object-cover"
            onError={(e: SyntheticEvent<HTMLImageElement>) => {
              const parent = e.currentTarget.parentElement;
              if (parent) parent.style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center bg-emerald-950/30 border-b border-emerald-500/10" style={{ height: 56 }}>
          <ImageIcon className="w-6 h-6 text-emerald-900" aria-hidden="true" />
        </div>
      )}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-black text-white leading-tight">{entry.name}</p>
          <span className={`shrink-0 text-[9px] font-black px-2 py-0.5 rounded-full ${incomeMeta.bg} ${incomeMeta.tw} uppercase tracking-wider`}>
            {t(`transparency.income_category.${entry.incomeCategory ?? 'other'}`, entry.incomeCategory ?? 'other')}
          </span>
        </div>
        {entry.description && <p className="text-[11px] text-gray-500">{entry.description}</p>}
        {entry.provider && (
          entry.providerUrl
            ? <a href={entry.providerUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400 hover:underline flex items-center gap-1 font-semibold">
                {entry.provider} <ArrowUpRight className="w-3 h-3" />
              </a>
            : <p className="text-xs text-gray-500 font-semibold">{entry.provider}</p>
        )}
        <div className="flex items-center justify-between mt-auto pt-1">
          <div>
            <span className="text-sm font-black text-emerald-300">
              {fmt(entry.amountUsd)}
              <span className="text-[11px] text-gray-500 ml-1">/{t(`transparency.period.${periodKey}`)}</span>
            </span>
            {entry.amountOriginal != null ? (
              <p className="text-[10px] text-gray-500 mt-0.5">
                {Number(entry.amountOriginal).toLocaleString('en-US', { maximumFractionDigits: 8 })} {entry.currencyCode || 'USD'}
                {entry.fxRateUsd ? ` · fx ${fmtMaybe(entry.fxRateUsd, 4)}` : ''}
              </p>
            ) : null}
          </div>
          {entry.isPaid
            ? <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{t('transparency.status.received')}</span>
            : <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">{t('transparency.status.pending')}</span>}
        </div>
        {entry.isOnChain && (entry.walletAddress || entry.txHash) ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {entry.walletAddress ? (
              <a
                href={`https://polygonscan.com/address/${entry.walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-300"
              >
                {t('transparency.wallet_link')} <ExternalLink className="w-3 h-3" />
              </a>
            ) : null}
            {entry.txHash ? (
              <a
                href={`https://polygonscan.com/tx/${entry.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-1 text-[10px] font-bold text-purple-300"
              >
                Tx <ExternalLink className="w-3 h-3" />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Single expense row inside the full breakdown table.
 */
export function EntryRow({ entry }: { entry: TransparencyEntry }) {
  const { t } = useTranslation();
  const style = CATEGORY_STYLE[entry.category as CategoryKey] || CATEGORY_STYLE.misc;
  const Icon = CATEGORY_ICONS[entry.category as CategoryKey] || Package;
  const periodKey = entry.period in { daily: 1, monthly: 1, annual: 1, one_time: 1 } ? entry.period : 'monthly';

  return (
    <tr className="border-b border-white/[0.04] hover:bg-white/[0.025] transition-colors" data-testid="entry-row">
      <td className="py-3 px-4">
        <div className="flex items-center gap-3">
          <span className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-xl ${style.bg}`}>
            <Icon className={`w-3.5 h-3.5 ${style.tw}`} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold text-white leading-tight">{entry.name}</p>
            {entry.description && <p className="text-[11px] text-gray-500 leading-tight mt-0.5">{entry.description}</p>}
          </div>
        </div>
      </td>
      <td className="py-3 px-4 hidden md:table-cell">
        {entry.provider ? (
          entry.providerUrl
            ? <a href={entry.providerUrl} target="_blank" rel="noopener noreferrer" className={`text-xs font-semibold ${style.tw} hover:underline flex items-center gap-1`}>
                {entry.provider} <ExternalLink className="w-3 h-3" />
              </a>
            : <span className={`text-xs font-semibold ${style.tw}`}>{entry.provider}</span>
        ) : <span className="text-xs text-gray-700">&#8212;</span>}
      </td>
      <td className="py-3 px-4 text-right whitespace-nowrap">
        <div>
          <span className="text-sm font-black text-white">{fmt(entry.amountUsd)}</span>
          <span className="text-[11px] text-gray-600 ml-1">/{t(`transparency.period.${periodKey}`)}</span>
          {entry.amountOriginal != null ? (
            <div className="text-[10px] text-gray-600 mt-0.5">
              {Number(entry.amountOriginal).toLocaleString('en-US', { maximumFractionDigits: 8 })} {entry.currencyCode || 'USD'}
            </div>
          ) : null}
        </div>
      </td>
      <td className="py-3 px-4 text-right">
        <div className="flex flex-col items-end gap-1">
          {entry.isPaid
            ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> {t('transparency.status.paid')}
              </span>
            : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-full">
                <Clock className="w-3 h-3" aria-hidden="true" /> {t('transparency.status.pending')}
              </span>}
          {entry.isOnChain ? (
            <span className="text-[10px] font-bold text-sky-300">
              {entry.blockchain || 'polygon'}{entry.direction ? ` · ${entry.direction}` : ''}
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
