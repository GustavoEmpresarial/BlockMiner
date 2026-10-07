import type { ReactNode } from 'react';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ShopSectionHeaderProps {
  icon: ReactNode;
  title: string;
  description?: string;
  salesAvailableAt?: string | null;
}

const OFFER_DATE_LOCALE = 'pt-BR';

function upcomingSalesDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at) || at <= Date.now()) return null;
  return iso;
}

function fmtDate(iso: string | null | undefined, localeTag: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString(localeTag, { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })
  );
}

export function ShopSectionHeader({
  icon,
  title,
  description,
  salesAvailableAt,
}: ShopSectionHeaderProps) {
  const { t } = useTranslation();
  const opensAt = upcomingSalesDate(salesAvailableAt);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 pb-2 border-b border-slate-800/80 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center shadow-[2px_2px_0px_#000000] shrink-0">
            {icon}
          </div>
          <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-300 truncate">{title}</h2>
        </div>
        {opensAt && (
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold">{t('shop.sales_opens_at')}:</span>
            <span>{fmtDate(opensAt, OFFER_DATE_LOCALE)}</span>
          </div>
        )}
      </div>
      {description && <p className="max-w-3xl text-xs sm:text-sm text-slate-400 font-medium pl-1">{description}</p>}
    </div>
  );
}
