import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Package } from 'lucide-react';
import { IconBadge, StatusPill } from '../../../shared/components';
import { hasLivePartOffers, partDiscountPercent } from '../lib/offers.api';
import type { PartOffersDTO, PartOfferItemDTO, PartPackDTO } from '../lib/offers.api';

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
  onBuyPack: (pack: PartPackDTO) => void;
  buying: boolean;
}

function formatPartPrice(value: number): string {
  return value < 0.01 ? value.toFixed(4) : value.toFixed(2);
}

export function PartOffersSection({
  offers,
  onBuyPart,
  onBuyPack,
  buying,
}: PartOffersSectionProps) {
  const { t } = useTranslation();
  const [rarityFilter, setRarityFilter] = useState<string>('all');

  if (!offers || !hasLivePartOffers(offers)) return null;
  const items = offers.items ?? [];
  const packs = offers.packs ?? [];

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

      {packs.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {packs.map((pack) => (
            <div
              key={pack.id}
              data-testid={`part-pack-${pack.id}`}
              className="flex flex-col justify-between gap-4 rounded-2xl border-2 border-primary/40 bg-slate-900/80 p-5 shadow-[4px_4px_0px_#000000]"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <IconBadge icon={Package} variant="sky" size="md" />
                    <div>
                      <h3 className="text-base font-black text-white">{t(pack.nameKey)}</h3>
                      <p className="text-xs text-slate-400">{t(pack.descriptionKey)}</p>
                    </div>
                  </div>
                  {pack.badgeKey && (
                    <span className="shrink-0 rounded-lg border border-emerald-500/60 bg-emerald-900/60 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-300">
                      {t(pack.badgeKey)}
                    </span>
                  )}
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {pack.items.map((it) => (
                    <li
                      key={`${it.slug}-${it.rarity}`}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-[11px] font-bold text-slate-300"
                    >
                      {it.quantity}× {t(`parts.items.${it.slug}`, { defaultValue: it.slug })} ·{' '}
                      {t(`parts.rarity.${it.rarity}`, { defaultValue: it.rarity })}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
                <span className="text-lg font-black text-white font-mono">
                  {formatPartPrice(pack.price)}{' '}
                  <span className="text-xs font-bold uppercase text-slate-400">{pack.currency}</span>
                </span>
                <button
                  type="button"
                  disabled={buying}
                  onClick={() => onBuyPack(pack)}
                  className="rounded-lg bg-primary hover:bg-primary-hover active:translate-x-0.5 active:translate-y-0.5 px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all disabled:opacity-40"
                >
                  {t('shop.buy', { defaultValue: 'Comprar' })}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {items
          .filter((it) => rarityFilter === 'all' || it.rarity === rarityFilter)
          .map((part) => {
            const theme = RARITY_THEMES[part.rarity] ?? RARITY_THEMES.common;
            const priceStr = formatPartPrice(part.price);
            const listPriceStr = formatPartPrice(part.listPrice);
            const discount = partDiscountPercent(part.price, part.listPrice);

            return (
              <div
                key={`${part.slug}-${part.rarity}`}
                data-testid={`part-offer-${part.slug}-${part.rarity}`}
                className={`group relative overflow-hidden rounded-2xl border-2 ${theme.border} ${theme.bg} p-4 shadow-[4px_4px_0px_#000000] transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${theme.badge}`}
                    >
                      {t(`parts.rarity.${part.rarity}`, { defaultValue: part.rarity })}
                    </span>
                    {discount > 0 && (
                      <span className="text-[10px] font-bold text-emerald-400 font-mono">-{discount}%</span>
                    )}
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
                    {discount > 0 && (
                      <span className="text-[9px] line-through text-slate-500 font-mono">
                        {listPriceStr} {part.currency}
                      </span>
                    )}
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
