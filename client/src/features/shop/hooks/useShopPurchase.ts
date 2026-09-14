import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { isAxiosError } from 'axios';
import { useGameStore } from '../../shell/lib/game.store';
import {
  postShopPurchase,
  postShopPurchaseFan,
  postShopPurchaseRack,
} from '../lib/shop.api';
import type {
  PurchaseModalState,
  ShopCatalogFan,
  ShopCatalogMiner,
  ShopCatalogRack,
} from '../lib/shop.types';
import { reportApiFailure } from '../../../shared/utils/reportApiFailure';

export const MAX_SHOP_QTY = 25;

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function useShopPurchase() {
  const { t } = useTranslation();
  const { fetchAll } = useGameStore();
  const [modal, setModal] = useState<PurchaseModalState | null>(null);
  const [buying, setBuying] = useState(false);
  const [quantity, setQuantity] = useState(1);

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

  const closeModal = () => {
    if (!buying) {
      setModal(null);
    }
  };

  const confirmPurchase = async () => {
    if (!modal || buying) return;

    const qty = Math.min(MAX_SHOP_QTY, Math.max(1, Number(quantity) || 1));
    if (!Number.isInteger(qty)) {
      toast.error(t('shop.invalid_quantity', { defaultValue: 'Quantidade inválida.' }));
      return;
    }

    const idempotencyKey = generateIdempotencyKey();

    try {
      setBuying(true);

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
      reportApiFailure(
        {
          operation:
            modal.kind === 'miner'
              ? 'shop_purchase_miner'
              : modal.kind === 'fan'
                ? 'shop_purchase_fan'
                : 'shop_purchase_rack',
          message: 'Failed to complete shop purchase',
          context: {
            kind: modal.kind,
            quantity: qty,
          },
        },
        err,
      );
      toast.error(t('common.error'));
    } finally {
      setBuying(false);
    }
  };

  return {
    modal,
    buying,
    quantity,
    maxQty: MAX_SHOP_QTY,
    setQuantity,
    openMinerModal,
    openFanModal,
    openRackModal,
    closeModal,
    confirmPurchase,
  };
}
