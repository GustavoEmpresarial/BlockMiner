import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Boxes, Puzzle, Wind, Zap } from 'lucide-react';
import { useShopCatalog } from './hooks/useShopCatalog';
import { useShopPurchase } from './hooks/useShopPurchase';
import { ShopSectionHeader } from './components/ShopSectionHeader';
import { ShopMinerCard } from './components/ShopMinerCard';
import { ShopFanCard } from './components/ShopFanCard';
import { ShopRackCard } from './components/ShopRackCard';
import { ShopPartCard } from './components/ShopPartCard';
import { ShopPurchaseModal } from './components/ShopPurchaseModal';
import { ShopLoadingState } from './components/ShopLoadingState';
import { ShopEmptyState } from './components/ShopEmptyState';

export default function ShopPage() {
  const { t } = useTranslation();
  const {
    miners,
    fans,
    racks,
    parts,
    shopCurrency,
    fanSalesAvailableAt,
    rackSalesAvailableAt,
    loading,
  } = useShopCatalog();

  const {
    modal,
    buying,
    quantity,
    maxQty,
    setQuantity,
    openMinerModal,
    openFanModal,
    openRackModal,
    openPartModal,
    closeModal,
    confirmPurchase,
  } = useShopPurchase();
  const [partRarity, setPartRarity] = useState<string>('all');

  if (loading) {
    return <ShopLoadingState />;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-14 pb-20 duration-700">
      <div className="space-y-2">
        <h1 className="text-3xl font-black uppercase tracking-tight text-white">
          {t('shop.title')}
        </h1>
      </div>

      {racks.length > 0 && (
        <section className="space-y-6" aria-labelledby="racks-heading">
          <ShopSectionHeader
            icon={<Boxes className="h-6 w-6 text-amber-400" />}
            title={t('shop.racks_section_title')}
            description={t('shop.racks_section_desc')}
            salesAvailableAt={rackSalesAvailableAt}
          />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {racks.map((rack) => (
              <ShopRackCard
                key={rack.sku}
                rack={rack}
                shopCurrency={shopCurrency}
                onSelect={openRackModal}
              />
            ))}
          </div>
        </section>
      )}

      {fans.length > 0 && (
        <section className="space-y-6" aria-labelledby="fans-heading">
          <ShopSectionHeader
            icon={<Wind className="h-6 w-6 text-cyan-400" />}
            title={t('shop.fans_section_title')}
            description={t('shop.fans_section_desc')}
            salesAvailableAt={fanSalesAvailableAt}
          />
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {fans.map((fan) => (
              <ShopFanCard
                key={fan.sku}
                fan={fan}
                shopCurrency={shopCurrency}
                onSelect={openFanModal}
              />
            ))}
          </div>
        </section>
      )}

      {parts.length > 0 && (
        <section className="space-y-6" aria-labelledby="parts-heading" data-testid="shop-parts-section">
          <ShopSectionHeader
            icon={<Puzzle className="h-6 w-6 text-sky-400" />}
            title={t('parts.shop_section_title')}
            description={t('parts.shop_section_desc')}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label={t('parts.rarity_tree_title')} className="flex flex-wrap gap-1.5">
              {(['all', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={partRarity === r}
                  onClick={() => setPartRarity(r)}
                  className={`rounded-xl border px-3 py-1 text-[11px] font-black uppercase tracking-wider transition-all ${
                    partRarity === r
                      ? 'border-primary bg-primary text-slate-950'
                      : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white'
                  }`}
                >
                  {r === 'all' ? t('common.all', { defaultValue: 'Todas' }) : t(`parts.rarity.${r}`, { defaultValue: r })}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              {t('parts.offers.free_hint')}{' '}
              <Link to="/merge" className="font-bold text-emerald-400 hover:underline">
                {t('parts.offers.free_link')}
              </Link>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {parts
              .filter((p) => partRarity === 'all' || p.rarity === partRarity)
              .map((part) => (
                <ShopPartCard
                  key={`${part.slug}-${part.rarity}`}
                  part={part}
                  shopCurrency={shopCurrency}
                  onSelect={openPartModal}
                />
              ))}
          </div>
        </section>
      )}

      <section className="space-y-6" aria-labelledby="miners-heading">
        <ShopSectionHeader
          icon={<Zap className="h-6 w-6 text-primary" />}
          title={t('shop.miners_section_title')}
        />
        {miners.length === 0 ? (
          <ShopEmptyState />
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {miners.map((miner) => (
              <ShopMinerCard
                key={miner.id}
                miner={miner}
                shopCurrency={shopCurrency}
                onSelect={openMinerModal}
              />
            ))}
          </div>
        )}
      </section>

      <ShopPurchaseModal
        modal={modal}
        shopCurrency={shopCurrency}
        buying={buying}
        quantity={quantity}
        maxQty={maxQty}
        onClose={closeModal}
        onSetQuantity={setQuantity}
        onConfirm={() => void confirmPurchase()}
      />
    </div>
  );
}
