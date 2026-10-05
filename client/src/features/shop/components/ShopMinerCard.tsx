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
    <div className="group relative overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-5 sm:p-6 shadow-[4px_4px_0px_#000000] transition-all duration-300 hover:border-slate-700">
      <div className="relative z-10 space-y-5">
        <div className="flex aspect-square items-center justify-center rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-4 transition-transform duration-300 group-hover:scale-105 shadow-[2px_2px_0px_#000000]">
          {miner.imageUrl ? (
            <MachineImage
              imageUrl={miner.imageUrl}
              name={miner.name || ''}
              className="h-full w-full object-contain"
            />
          ) : (
            <Zap className="h-14 w-14 text-amber-500/30" />
          )}
        </div>
        <div className="space-y-1">
          <h3 className="truncate text-lg sm:text-xl font-black text-white">{miner.name}</h3>
          <div className="flex items-center gap-1.5 font-bold text-primary">
            <Zap className="h-4 w-4" />
            <span className="text-sm font-black font-mono">{formatHashrate(Number(miner.baseHashRate) || 0)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-800/80 pt-4">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {t('shop.price')}
            </span>
            <span className="text-lg font-black text-white font-mono">
              {formatPrice(miner.price)}{' '}
              <span className="text-xs font-bold uppercase text-slate-400">{currency}</span>
            </span>
          </div>
          <button
            type="button"
            disabled={!isAvailable}
            onClick={() => onSelect(miner)}
            className="rounded-xl bg-primary hover:bg-primary-hover active:translate-x-0.5 active:translate-y-0.5 px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('shop.buy')}
          </button>
        </div>
      </div>
    </div>
  );
}
