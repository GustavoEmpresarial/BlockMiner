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
    <div className="group relative overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-[4px_4px_0px_#000000] transition-all duration-300 hover:border-slate-700">
      <div className="relative z-10 space-y-5">
        <div className="flex items-start justify-between">
          <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-cyan-300 shadow-[2px_2px_0px_#000000]">
            {t('shop.fan_badge')}
          </div>
          {!purchaseLive && (
            <span className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300 shadow-[2px_2px_0px_#000000]">
              <Clock className="h-3 w-3" />
              {t('offers.coming_soon')}
            </span>
          )}
        </div>
        <div className="flex aspect-square items-center justify-center rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-4 transition-transform duration-300 group-hover:scale-105 shadow-[2px_2px_0px_#000000]">
          <CoolingFanUnit spinning className="h-auto w-full max-w-md" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg sm:text-xl font-black text-white">{t(fan.nameKey)}</h3>
          <p className="text-xs text-slate-400 font-medium">{t(fan.descriptionKey)}</p>
        </div>
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {t('shop.price')}
            </span>
            <span className="text-lg font-black text-white font-mono">
              {formatPrice(fan.price)}{' '}
              <span className="text-xs font-bold uppercase text-slate-400">{currency}</span>
            </span>
          </div>
          <button
            type="button"
            disabled={!purchaseLive}
            onClick={() => onSelect(fan)}
            className="rounded-xl bg-primary hover:bg-primary-hover active:translate-x-0.5 active:translate-y-0.5 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all disabled:cursor-not-allowed disabled:opacity-40"
          >
            {purchaseLive ? t('shop.buy') : t('offers.coming_soon')}
          </button>
        </div>
      </div>
    </div>
  );
}
