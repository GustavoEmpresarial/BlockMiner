import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import {
  AlertTriangle,
  Boxes,
  Clock,
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { formatHashrate } from '../machines/lib/machines.shared';
import { formatPrice } from '../../shared/utils/formatPrice';
import { MachineImage } from '../machines/components/MachineImage';
import { CoolingFanUnit } from '../inventory2/components/CoolingFanUnit';
import { MiningRackShelf } from '../inventory2/components/MiningRackShelf';
import { useGameStore } from '../shell/lib/game.store';
import {
  getShopMiners,
  postShopPurchase,
  postShopPurchaseFan,
  postShopPurchaseRack,
  type ShopCatalogFan,
  type ShopCatalogMiner,
  type ShopCatalogRack,
} from './lib/shop.api';

const MAX_QTY = 25;
const OFFER_DATE_LOCALE = 'pt-BR';

type PurchaseModal =
  | { kind: 'miner'; item: ShopCatalogMiner }
  | { kind: 'fan'; item: ShopCatalogFan }
  | { kind: 'rack'; item: ShopCatalogRack };

/** Catalog media SVGs are wide stubs; inline art always paints in the square card. */
function FanShopArt() {
  return <CoolingFanUnit spinning className="h-auto w-full max-w-md" />;
}

function RackShopArt() {
  return <MiningRackShelf className="h-auto w-full max-w-md" />;
}

function fmtDate(iso: string | null | undefined, localeTag: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return (
    d.toLocaleDateString(localeTag, { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' '
    + d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' })
  );
}

function readApiError(err: unknown, fallback: string): string {
  if (!isAxiosError(err)) return fallback;
  const data = err.response?.data;
  if (data && typeof data === 'object' && data !== null) {
    const messageKey = 'messageKey' in data && typeof data.messageKey === 'string' ? data.messageKey : null;
    const message = 'message' in data && typeof data.message === 'string' ? data.message : null;
    const messageParams =
      'messageParams' in data && data.messageParams && typeof data.messageParams === 'object'
        ? (data.messageParams as Record<string, unknown>)
        : undefined;
    if (messageKey) return messageKey;
    if (message) return message;
    void messageParams;
  }
  return fallback;
}

export default function ShopPage() {
  const { t } = useTranslation();
  const { fetchAll } = useGameStore();
  const [miners, setMiners] = useState<ShopCatalogMiner[]>([]);
  const [fans, setFans] = useState<ShopCatalogFan[]>([]);
  const [racks, setRacks] = useState<ShopCatalogRack[]>([]);
  const [shopCurrency, setShopCurrency] = useState('BLK');
  const [fanSalesAvailableAt, setFanSalesAvailableAt] = useState<string | null>(null);
  const [rackSalesAvailableAt, setRackSalesAvailableAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState(false);
  const [modal, setModal] = useState<PurchaseModal | null>(null);
  const [quantity, setQuantity] = useState(1);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getShopMiners();
      if (res.data?.ok) {
        setMiners(res.data.miners ?? []);
        setFans(res.data.fans ?? []);
        setRacks(Array.isArray(res.data.racks) ? res.data.racks : []);
        setShopCurrency(res.data.currency || 'BLK');
        setFanSalesAvailableAt(res.data.fanSalesAvailableAt ?? null);
        setRackSalesAvailableAt(res.data.rackSalesAvailableAt ?? null);
      }
    } catch (err) {
      console.error(err);
      toast.error(t('shop.errors.list_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openMinerModal = (item: ShopCatalogMiner) => {
    if (!item?.id || !Number.isFinite(Number(item.price)) || Number(item.price) <= 0) {
      toast.error(t('shop.invalid_miner', { defaultValue: 'Este equipamento não está disponível para compra.' }));
      return;
    }
    setQuantity(1);
    setModal({ kind: 'miner', item });
  };

  const openFanModal = (item: ShopCatalogFan) => {
    setQuantity(1);
    setModal({ kind: 'fan', item });
  };

  const openRackModal = (item: ShopCatalogRack) => {
    setQuantity(1);
    setModal({ kind: 'rack', item });
  };

  const confirmPurchase = async () => {
    if (!modal || buying) return;
    const qty = Math.min(MAX_QTY, Math.max(1, Number(quantity) || 1));
    if (!Number.isInteger(qty)) {
      toast.error(t('shop.invalid_quantity', { defaultValue: 'Quantidade inválida.' }));
      return;
    }
    try {
      setBuying(true);
      const idempotencyKey =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      if (modal.kind === 'miner') {
        const res = await postShopPurchase({ minerId: modal.item.id, quantity: qty, idempotencyKey });
        if (res.data?.ok) {
          const messageKey = res.data.messageKey;
          const params = res.data.messageParams;
          toast.success(
            typeof messageKey === 'string' && messageKey
              ? t(messageKey, params as Record<string, unknown>)
              : res.data.message || t('shop.purchase_success'),
          );
          fetchAll();
          setModal(null);
        }
      } else if (modal.kind === 'fan') {
        const res = await postShopPurchaseFan({ sku: modal.item.sku, quantity: qty, idempotencyKey });
        if (res.data?.ok) {
          const messageKey = res.data.messageKey;
          const params = res.data.messageParams;
          toast.success(
            typeof messageKey === 'string' && messageKey
              ? t(messageKey, params as Record<string, unknown>)
              : res.data.message || t('fans.purchase_success'),
          );
          fetchAll();
          setModal(null);
        }
      } else {
        const res = await postShopPurchaseRack({ sku: modal.item.sku, quantity: qty, idempotencyKey });
        if (res.data?.ok) {
          const messageKey = res.data.messageKey;
          const params = res.data.messageParams;
          toast.success(
            typeof messageKey === 'string' && messageKey
              ? t(messageKey, params as Record<string, unknown>)
              : res.data.message || t('racks.purchase_success_detail', { count: qty }),
          );
          fetchAll();
          setModal(null);
        }
      }
    } catch (err) {
      if (isAxiosError(err)) {
        const data = err.response?.data;
        if (data && typeof data === 'object' && data !== null) {
          const messageKey = 'messageKey' in data && typeof data.messageKey === 'string' ? data.messageKey : null;
          const message = 'message' in data && typeof data.message === 'string' ? data.message : null;
          const messageParams =
            'messageParams' in data && data.messageParams && typeof data.messageParams === 'object'
              ? (data.messageParams as Record<string, unknown>)
              : undefined;
          if (messageKey) {
            toast.error(t(messageKey, messageParams));
            return;
          }
          if (message) {
            toast.error(message);
            return;
          }
        }
      }
      toast.error(readApiError(err, t('common.error')));
    } finally {
      setBuying(false);
    }
  };

  const modalUnitPrice = useMemo(() => {
    if (!modal) return 0;
    return Number(modal.item.price) || 0;
  }, [modal]);

  const modalCurrency = useMemo(() => {
    if (!modal) return shopCurrency;
    return modal.item.currency || shopCurrency;
  }, [modal, shopCurrency]);

  if (loading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-xs font-bold uppercase tracking-widest text-gray-500">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-14 pb-20 duration-700">
      <div className="space-y-2">
        <h1 className="text-3xl font-black uppercase italic tracking-tight text-white">{t('shop.title')}</h1>
        <p className="max-w-3xl text-sm text-gray-500">{t('shop.subtitle')}</p>
      </div>

      {racks.length > 0 && (
        <section className="space-y-6">
          <div className="flex flex-col gap-3 border-b border-gray-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Boxes className="h-6 w-6 text-amber-400" />
              <h2 className="text-xl font-black uppercase italic tracking-tight text-white">
                {t('shop.racks_section_title')}
              </h2>
            </div>
            {rackSalesAvailableAt && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-semibold">{t('shop.sales_opens_at')}:</span>
                <span>{fmtDate(rackSalesAvailableAt, OFFER_DATE_LOCALE)}</span>
              </div>
            )}
          </div>
          <p className="max-w-3xl text-sm text-gray-500">{t('shop.racks_section_desc')}</p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {racks.map((rack) => {
              const purchaseLive = rack.isPurchaseLive !== false;
              return (
                <div
                  key={rack.sku}
                  className="group relative overflow-hidden rounded-[2.5rem] border border-amber-500/20 bg-surface p-8 shadow-xl transition-all duration-500 hover:border-amber-400/40"
                >
                  <div className="relative z-10 space-y-6">
                    <div className="flex items-start justify-between">
                      <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-amber-300">
                        {t('shop.rack_badge')}
                      </div>
                      {!purchaseLive && (
                        <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-amber-400">
                          <Clock className="h-3 w-3" />
                          {t('offers.coming_soon')}
                        </span>
                      )}
                    </div>
                    <div className="flex aspect-square items-center justify-center rounded-3xl border border-gray-800 bg-gray-900/50 p-6 transition-transform duration-500 group-hover:scale-105">
                      <RackShopArt />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-black text-white">
                        {t(rack.nameKey || 'racks.mining_rack_name', { defaultValue: 'Rack' })}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {t(rack.descriptionKey || 'racks.mining_rack_desc', {
                          defaultValue: 'Prateleira com 8 slots — instale no inventário.',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-800/50 pt-4">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{t('shop.price')}</span>
                        <span className="text-lg font-black italic text-white">
                          {formatPrice(rack.price)}{' '}
                          <span className="text-xs font-bold not-italic uppercase text-gray-500">{rack.currency || shopCurrency}</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={!purchaseLive}
                        onClick={() => openRackModal(rack)}
                        className="rounded-2xl bg-primary px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {purchaseLive ? t('shop.buy') : t('offers.coming_soon')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {fans.length > 0 && (
        <section className="space-y-6">
          <div className="flex flex-col gap-3 border-b border-gray-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Wind className="h-6 w-6 text-cyan-400" />
              <h2 className="text-xl font-black uppercase italic tracking-tight text-white">{t('shop.fans_section_title')}</h2>
            </div>
            {fanSalesAvailableAt && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="font-semibold">{t('shop.sales_opens_at')}:</span>
                <span>{fmtDate(fanSalesAvailableAt, OFFER_DATE_LOCALE)}</span>
              </div>
            )}
          </div>
          <p className="max-w-3xl text-sm text-gray-500">{t('shop.fans_section_desc')}</p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {fans.map((fan) => {
              const purchaseLive = fan.isPurchaseLive !== false;
              return (
                <div
                  key={fan.sku}
                  className="group relative overflow-hidden rounded-[2.5rem] border border-cyan-500/20 bg-surface p-8 shadow-xl transition-all duration-500 hover:border-cyan-400/40"
                >
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
                      <FanShopArt />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-xl font-black text-white">{t(fan.nameKey)}</h3>
                      <p className="text-xs text-gray-500">{t(fan.descriptionKey)}</p>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-800/50 pt-4">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{t('shop.price')}</span>
                        <span className="text-lg font-black italic text-white">
                          {formatPrice(fan.price)}{' '}
                          <span className="text-xs font-bold not-italic uppercase text-gray-500">{fan.currency || shopCurrency}</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={!purchaseLive}
                        onClick={() => openFanModal(fan)}
                        className="rounded-2xl bg-primary px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {purchaseLive ? t('shop.buy') : t('offers.coming_soon')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-6">
        <div className="flex items-center gap-3 border-b border-gray-800 pb-4">
          <Zap className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-black uppercase italic tracking-tight text-white">{t('shop.miners_section_title')}</h2>
        </div>
        {miners.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-gray-800 p-12 text-center text-gray-500">
            {t('shop.loading_error', { defaultValue: 'Nenhum equipamento disponível.' })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {miners.map((miner) => (
              <div
                key={miner.id}
                className="group relative overflow-hidden rounded-[2.5rem] border border-gray-800/50 bg-surface p-8 shadow-xl transition-all duration-500 hover:border-primary/30"
              >
                <div className="relative z-10 space-y-6">
                  <div className="flex aspect-square items-center justify-center rounded-3xl border border-gray-800 bg-gray-900/50 p-6 transition-transform duration-500 group-hover:scale-105">
                    {miner.imageUrl ? (
                      <MachineImage imageUrl={miner.imageUrl} name={miner.name || ''} className="h-full w-full object-contain" />
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
                      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{t('shop.price')}</span>
                      <span className="text-lg font-black italic text-white">
                        {formatPrice(miner.price)}{' '}
                        <span className="text-xs font-bold not-italic uppercase text-gray-500">{miner.currency || shopCurrency}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openMinerModal(miner)}
                      className="rounded-2xl bg-primary px-6 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-hover active:scale-95"
                    >
                      {t('shop.buy')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {modal && createPortal(
        <div className="fixed inset-0 z-[100] flex animate-in fade-in items-center justify-center bg-background/80 p-4 backdrop-blur-md duration-300">
          <div className="relative w-full max-w-md animate-in zoom-in-95 overflow-hidden rounded-[3rem] border border-gray-800 bg-surface shadow-2xl duration-300">
            <button
              type="button"
              onClick={() => !buying && setModal(null)}
              className="absolute right-0 top-0 p-6 text-gray-500 transition-colors hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="space-y-8 p-10">
              <div className="space-y-2 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10">
                  {modal.kind === 'fan' ? (
                    <Wind className="h-10 w-10 text-cyan-400" />
                  ) : modal.kind === 'rack' ? (
                    <Boxes className="h-10 w-10 text-amber-400" />
                  ) : (
                    <ShoppingCart className="h-10 w-10 text-primary" />
                  )}
                </div>
                <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white">{t('shop.modal_title')}</h3>
                <p className="font-medium text-gray-500">{t('shop.modal_subtitle')}</p>
              </div>

              <div className="rounded-3xl border border-gray-800 bg-gray-900/40 p-6 text-center">
                <p className="text-lg font-black text-white">
                  {modal.kind === 'miner'
                    ? modal.item.name
                    : modal.kind === 'fan'
                      ? t(modal.item.nameKey)
                      : t(modal.item.nameKey || 'racks.mining_rack_name', { defaultValue: 'Rack' })}
                </p>
                {modal.kind === 'miner' && (
                  <p className="mt-1 text-sm font-bold text-primary">{formatHashrate(Number(modal.item.baseHashRate) || 0)}</p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-gray-800 bg-gray-900/50 px-4 py-3">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{t('shop.quantity')}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={buying || quantity <= 1}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="rounded-xl border border-gray-700 p-2 text-gray-400 hover:text-white disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-[2rem] text-center text-lg font-black text-white">{quantity}</span>
                  <button
                    type="button"
                    disabled={buying || quantity >= MAX_QTY}
                    onClick={() => setQuantity((q) => Math.min(MAX_QTY, q + 1))}
                    className="rounded-xl border border-gray-700 p-2 text-gray-400 hover:text-white disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-gray-800 bg-gray-900/50 px-4 py-4">
                <span className="text-xs font-bold uppercase tracking-widest text-gray-500">{t('shop.total_to_pay')}</span>
                <span className="text-xl font-black italic text-white">
                  {(modalUnitPrice * quantity).toFixed(2)}{' '}
                  <span className="text-xs font-bold not-italic uppercase text-gray-500">{modalCurrency}</span>
                </span>
              </div>

              <button
                type="button"
                onClick={() => void confirmPurchase()}
                disabled={buying}
                className="flex w-full items-center justify-center gap-3 rounded-[2rem] bg-primary py-5 text-sm font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-primary/20 transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
              >
                {buying ? <Loader2 className="h-5 w-5 animate-spin" /> : t('shop.confirm_payment')}
              </button>

              <div className="flex items-center justify-center gap-2 text-amber-500/50">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest">{t('shop.irreversible_warning')}</span>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
