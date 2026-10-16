import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu } from 'lucide-react';
import { IconBadge, StatusPill } from '../../../shared/components';
import type { PartOffersDTO, PartOfferItemDTO } from '../lib/offers.api';

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

interface PartOffersSectionProps {
  offers: PartOffersDTO | null;
  onBuyPart: (item: PartOfferItemDTO) => void;
  buying: boolean;
}

export function PartOffersSection({
  offers,
  onBuyPart,
  buying,
}: PartOffersSectionProps) {
  const { t } = useTranslation();
  const [rarityFilter, setRarityFilter] = useState<string>('all');

  if (!offers?.isLive) return null;
  const items = offers.items ?? [];
  if (items.length === 0) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b-2 border-slate-800">
        <div className="flex items-center gap-3">
          <IconBadge icon={Cpu} variant="sky" size="md" />
          <h2 className="text-lg sm:text-xl font-black text-white uppercase italic tracking-tight">
            {t('parts.offers.title', { defaultValue: 'Peças de Forja' })}
          </h2>
          <StatusPill variant="success" label={t('offers.live', { defaultValue: 'Ao Vivo' })} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-2xl border-2 border-slate-800 self-start sm:self-auto">
          {(['all', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRarityFilter(r)}
              className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all ${
                rarityFilter === r
                  ? 'bg-primary text-slate-950 shadow-[2px_2px_0px_#000000]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {r === 'all' ? t('common.all', { defaultValue: 'Todas' }) : t(`parts.rarity.${r}`, { defaultValue: r })}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {items
          .filter((it) => rarityFilter === 'all' || it.rarity === rarityFilter)
          .map((part) => {
            const theme = RARITY_THEMES[part.rarity] ?? RARITY_THEMES.common;
            const priceStr =
              part.price < 0.01 ? part.price.toFixed(4) : part.price.toFixed(2);
            const listPriceStr =
              part.listPrice < 0.01 ? part.listPrice.toFixed(4) : part.listPrice.toFixed(2);

            return (
              <div
                key={`${part.slug}-${part.rarity}`}
                className={`group relative overflow-hidden rounded-2xl border-2 ${theme.border} ${theme.bg} p-4 shadow-[4px_4px_0px_#000000] transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${theme.badge}`}
                    >
                      {t(`parts.rarity.${part.rarity}`, { defaultValue: part.rarity })}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400 font-mono">
                      -25%
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
                    <span className="text-[9px] line-through text-slate-500 font-mono">
                      {listPriceStr} {part.currency}
                    </span>
                    <span className="text-sm font-black text-white font-mono">
                      {priceStr}{' '}
                      <span className="text-[10px] font-bold uppercase text-slate-400">
                        {part.currency}
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={buying}
                    onClick={() => onBuyPart(part)}
                    className="rounded-lg bg-primary hover:bg-primary-hover active:translate-x-0.5 active:translate-y-0.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all disabled:opacity-40"
                  >
                    {t('shop.buy', { defaultValue: 'Comprar' })}
                  </button>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
