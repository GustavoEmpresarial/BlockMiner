import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatPrice } from '../../../shared/utils/formatPrice';
import { RackCatalogArt } from '../../inventory2/components/RackCatalogArt';
import type { ShopCatalogRack } from '../lib/shop.types';

interface ShopRackCardProps {
  rack: ShopCatalogRack;
  shopCurrency: string;
  onSelect: (rack: ShopCatalogRack) => void;
}

export function ShopRackCard({ rack, shopCurrency, onSelect }: ShopRackCardProps) {
  const { t } = useTranslation();
  const purchaseLive = rack.isPurchaseLive !== false;
  const currency = rack.currency || shopCurrency;

  return (
    <div className="group relative overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-[4px_4px_0px_#000000] transition-all duration-300 hover:border-slate-700">
      <div className="relative z-10 space-y-5">
        <div className="flex items-start justify-between">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300 shadow-[2px_2px_0px_#000000]">
            {t('shop.rack_badge')}
          </div>
          {!purchaseLive && (
            <span className="flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300 shadow-[2px_2px_0px_#000000]">
              <Clock className="h-3 w-3" />
              {t('offers.coming_soon')}
            </span>
          )}
        </div>
        <div className="flex aspect-square items-center justify-center rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-4 transition-transform duration-300 group-hover:scale-105 shadow-[2px_2px_0px_#000000]">
          <RackCatalogArt imageUrl={rack.imageUrl} />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg sm:text-xl font-black text-white">
            {t(rack.nameKey || 'racks.mining_rack_name', { defaultValue: 'Rack' })}
          </h3>
          <p className="text-xs text-slate-400 font-medium">
            {t(rack.descriptionKey || 'racks.mining_rack_desc', {
              defaultValue: 'Prateleira com 8 slots — instale no inventário.',
            })}
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {t('shop.price')}
            </span>
            <span className="text-lg font-black text-white font-mono">
              {formatPrice(rack.price)}{' '}
              <span className="text-xs font-bold uppercase text-slate-400">{currency}</span>
            </span>
          </div>
          <button
            type="button"
            disabled={!purchaseLive}
            onClick={() => onSelect(rack)}
            className="rounded-xl bg-primary hover:bg-primary-hover active:translate-x-0.5 active:translate-y-0.5 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all disabled:cursor-not-allowed disabled:opacity-40"
          >
            {purchaseLive ? t('shop.buy') : t('offers.coming_soon')}
          </button>
        </div>
      </div>
    </div>
  );
}
