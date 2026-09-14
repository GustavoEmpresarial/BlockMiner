import { useTranslation } from 'react-i18next';
import { Boxes, Wind, Zap } from 'lucide-react';
import { useShopCatalog } from './hooks/useShopCatalog';
import { useShopPurchase } from './hooks/useShopPurchase';
import { ShopSectionHeader } from './components/ShopSectionHeader';
import { ShopMinerCard } from './components/ShopMinerCard';
import { ShopFanCard } from './components/ShopFanCard';
import { ShopRackCard } from './components/ShopRackCard';
import { ShopPurchaseModal } from './components/ShopPurchaseModal';
import { ShopLoadingState } from './components/ShopLoadingState';
import { ShopEmptyState } from './components/ShopEmptyState';

export default function ShopPage() {
  const { t } = useTranslation();
  const {
    miners,
    fans,
    racks,
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
    closeModal,
    confirmPurchase,
  } = useShopPurchase();

  if (loading) {
    return <ShopLoadingState />;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-14 pb-20 duration-700">
      <div className="space-y-2">
        <h1 className="text-3xl font-black uppercase italic tracking-tight text-white">
          {t('shop.title')}
        </h1>
        <p className="max-w-3xl text-sm text-gray-500">{t('shop.subtitle')}</p>
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
