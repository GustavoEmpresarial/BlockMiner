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

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 border-b border-gray-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {icon}
          <h2 className="text-xl font-black uppercase italic tracking-tight text-white">{title}</h2>
        </div>
        {salesAvailableAt && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold">{t('shop.sales_opens_at')}:</span>
            <span>{fmtDate(salesAvailableAt, OFFER_DATE_LOCALE)}</span>
          </div>
        )}
      </div>
      {description && <p className="max-w-3xl text-sm text-gray-500">{description}</p>}
    </div>
  );
}
