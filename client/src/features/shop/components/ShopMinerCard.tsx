import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatHashrate } from '../../machines/lib/machines.shared';
import { formatPrice } from '../../../shared/utils/formatPrice';
import { MachineImage } from '../../machines/components/MachineImage';
import type { ShopCatalogMiner } from '../lib/shop.types';

interface ShopMinerCardProps {
  miner: ShopCatalogMiner;
  shopCurrency: string;
  onSelect: (miner: ShopCatalogMiner) => void;
}

export function ShopMinerCard({ miner, shopCurrency, onSelect }: ShopMinerCardProps) {
  const { t } = useTranslation();
  const numericPrice = Number(miner.price);
  const isAvailable = Number.isFinite(numericPrice) && numericPrice > 0;
  const currency = miner.currency || shopCurrency;

  return (
    <div className="group relative overflow-hidden rounded-[2.5rem] border border-gray-800/50 bg-surface p-8 shadow-xl transition-all duration-500 hover:border-primary/30">
      <div className="relative z-10 space-y-6">
        <div className="flex aspect-square items-center justify-center rounded-3xl border border-gray-800 bg-gray-900/50 p-6 transition-transform duration-500 group-hover:scale-105">
          {miner.imageUrl ? (
            <MachineImage
              imageUrl={miner.imageUrl}
              name={miner.name || ''}
              className="h-full w-full object-contain"
            />
          ) : (
            <Zap className="h-16 w-16 text-amber-500/30" />
          )}
        </div>
        <div className="space-y-1">
          <h3 className="truncate text-xl font-black text-white">{miner.name}</h3>
          <div className="flex items-center gap-2 font-bold text-primary">
            <Zap className="h-4 w-4" />
            <span className="text-sm">{formatHashrate(Number(miner.baseHashRate) || 0)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-gray-800/50 pt-4">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">
              {t('shop.price')}
            </span>
            <span className="text-lg font-black italic text-white">
              {formatPrice(miner.price)}{' '}
              <span className="text-xs font-bold not-italic uppercase text-gray-500">{currency}</span>
            </span>
          </div>
          <button
            type="button"
            disabled={!isAvailable}
            onClick={() => onSelect(miner)}
            className="rounded-2xl bg-primary px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('shop.buy')}
          </button>
        </div>
      </div>
    </div>
  );
}
