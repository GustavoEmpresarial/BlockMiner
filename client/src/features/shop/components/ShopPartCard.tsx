import { useTranslation } from 'react-i18next';
import type { ShopCatalogPart } from '../lib/shop.types';
import { formatPrice } from '../../../shared/utils/formatPrice';

const RARITY_THEMES: Record<
  string,
  {
    border: string;
    bg: string;
    badge: string;
    text: string;
  }
> = {
  common: {
    border: 'border-slate-500/50',
    bg: 'bg-slate-900/80',
    badge: 'bg-slate-700 text-slate-100 border-slate-500/60',
    text: 'text-slate-200',
  },
  uncommon: {
    border: 'border-emerald-500/60',
    bg: 'bg-emerald-950/40',
    badge: 'bg-emerald-800 text-emerald-200 border-emerald-500/60',
    text: 'text-emerald-300',
  },
  rare: {
    border: 'border-sky-500/60',
    bg: 'bg-sky-950/40',
    badge: 'bg-sky-800 text-sky-200 border-sky-500/60',
    text: 'text-sky-300',
  },
  epic: {
    border: 'border-purple-500/60',
    bg: 'bg-purple-950/40',
    badge: 'bg-purple-800 text-purple-200 border-purple-500/60',
    text: 'text-purple-300',
  },
  legendary: {
    border: 'border-amber-500/70',
    bg: 'bg-amber-950/40',
    badge: 'bg-amber-700 text-amber-100 border-amber-400/70',
    text: 'text-amber-300',
  },
};

interface ShopPartCardProps {
  part: ShopCatalogPart;
  shopCurrency: string;
  onSelect: (part: ShopCatalogPart) => void;
}

export function ShopPartCard({ part, shopCurrency, onSelect }: ShopPartCardProps) {
  const { t } = useTranslation();
  const theme = RARITY_THEMES[part.rarity] ?? RARITY_THEMES.common;
  const currency = part.currency || shopCurrency;

  const priceStr = formatPrice(part.price);

  return (
    <div
      data-testid={`shop-part-${part.slug}-${part.rarity}`}
      className={`group relative overflow-hidden rounded-2xl border-2 ${theme.border} ${theme.bg} p-4 shadow-[4px_4px_0px_#000000] transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span
            className={`rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${theme.badge}`}
          >
            {t(`parts.rarity.${part.rarity}`, { defaultValue: part.rarity })}
          </span>
          <span className="text-[10px] font-black uppercase text-slate-400">
            {currency}
          </span>
        </div>

        <div className="flex aspect-square items-center justify-center rounded-xl border border-slate-800/80 bg-slate-950/80 p-3 shadow-[2px_2px_0px_#000000]">
          {part.imageUrl ? (
            <img
              src={part.imageUrl}
              alt={part.slug}
              className="h-16 w-16 object-contain transition-transform duration-300 group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <div className="h-16 w-16 bg-slate-800 rounded-lg animate-pulse" />
          )}
        </div>

        <div>
          <h4 className={`text-sm font-black ${theme.text} truncate`}>
            {t(part.nameKey, { defaultValue: part.slug })}
          </h4>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-3">
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
            {t('shop.price')}
          </span>
          <span className="text-sm font-black text-white font-mono">
            {priceStr}{' '}
            <span className="text-[10px] font-bold uppercase text-slate-400">
              {currency}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => onSelect(part)}
          className="rounded-lg bg-primary hover:bg-primary-hover active:translate-x-0.5 active:translate-y-0.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all"
        >
          {t('shop.buy')}
        </button>
      </div>
    </div>
  );
}
