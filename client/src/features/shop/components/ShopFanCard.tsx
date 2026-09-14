import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatPrice } from '../../../shared/utils/formatPrice';
import { CoolingFanUnit } from '../../inventory2/components/CoolingFanUnit';
import type { ShopCatalogFan } from '../lib/shop.types';

interface ShopFanCardProps {
  fan: ShopCatalogFan;
  shopCurrency: string;
  onSelect: (fan: ShopCatalogFan) => void;
}

export function ShopFanCard({ fan, shopCurrency, onSelect }: ShopFanCardProps) {
  const { t } = useTranslation();
  const purchaseLive = fan.isPurchaseLive !== false;
  const currency = fan.currency || shopCurrency;

  return (
    <div className="group relative overflow-hidden rounded-[2.5rem] border border-cyan-500/20 bg-surface p-8 shadow-xl transition-all duration-500 hover:border-cyan-400/40">
      <div className="relative z-10 space-y-6">
        <div className="flex items-start justify-between">
          <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-300">
            {t('shop.fan_badge')}
          </div>
          {!purchaseLive && (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-amber-400">
              <Clock className="h-3 w-3" />
              {t('offers.coming_soon')}
            </span>
          )}
        </div>
        <div className="flex aspect-square items-center justify-center rounded-3xl border border-gray-800 bg-gray-900/50 p-6 transition-transform duration-500 group-hover:scale-105">
          <CoolingFanUnit spinning className="h-auto w-full max-w-md" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-black text-white">{t(fan.nameKey)}</h3>
          <p className="text-xs text-gray-500">{t(fan.descriptionKey)}</p>
        </div>
        <div className="flex items-center justify-between border-t border-gray-800/50 pt-4">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">
              {t('shop.price')}
            </span>
            <span className="text-lg font-black italic text-white">
              {formatPrice(fan.price)}{' '}
              <span className="text-xs font-bold not-italic uppercase text-gray-500">{currency}</span>
            </span>
          </div>
          <button
            type="button"
            disabled={!purchaseLive}
            onClick={() => onSelect(fan)}
            className="rounded-2xl bg-primary px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {purchaseLive ? t('shop.buy') : t('offers.coming_soon')}
          </button>
        </div>
      </div>
    </div>
  );
}
