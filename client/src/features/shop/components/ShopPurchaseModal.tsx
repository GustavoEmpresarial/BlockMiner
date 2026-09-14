import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Boxes,
  Loader2,
  Minus,
  Plus,
  ShoppingCart,
  Wind,
  X,
} from 'lucide-react';
import { formatHashrate } from '../../machines/lib/machines.shared';
import type { PurchaseModalState } from '../lib/shop.types';

interface ShopPurchaseModalProps {
  modal: PurchaseModalState | null;
  shopCurrency: string;
  buying: boolean;
  quantity: number;
  maxQty?: number;
  onClose: () => void;
  onSetQuantity: (qty: number | ((prev: number) => number)) => void;
  onConfirm: () => void;
}

export function ShopPurchaseModal({
  modal,
  shopCurrency,
  buying,
  quantity,
  maxQty = 25,
  onClose,
  onSetQuantity,
  onConfirm,
}: ShopPurchaseModalProps) {
  const { t } = useTranslation();

  // Close on Escape key press
  useEffect(() => {
    if (!modal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !buying) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modal, buying, onClose]);

  const unitPrice = useMemo(() => {
    if (!modal) return 0;
    return Number(modal.item.price) || 0;
  }, [modal]);

  const currency = useMemo(() => {
    if (!modal) return shopCurrency;
    return modal.item.currency || shopCurrency;
  }, [modal, shopCurrency]);

  const itemName = useMemo(() => {
    if (!modal) return '';
    if (modal.kind === 'miner') return modal.item.name || '';
    if (modal.kind === 'fan') return t(modal.item.nameKey);
    return t(modal.item.nameKey || 'racks.mining_rack_name', { defaultValue: 'Rack' });
  }, [modal, t]);

  if (!modal) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-modal-title"
      className="fixed inset-0 z-[100] flex animate-in fade-in items-center justify-center bg-background/80 p-4 backdrop-blur-md duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget && !buying) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-md animate-in zoom-in-95 overflow-hidden rounded-[3rem] border border-gray-800 bg-surface shadow-2xl duration-300">
        <button
          type="button"
          aria-label={t('common.close', { defaultValue: 'Fechar' })}
          disabled={buying}
          onClick={() => !buying && onClose()}
          className="absolute right-0 top-0 p-6 text-gray-500 transition-colors hover:text-white disabled:opacity-40"
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
            <h3 id="shop-modal-title" className="text-2xl font-black uppercase italic tracking-tighter text-white">
              {t('shop.modal_title')}
            </h3>
            <p className="font-medium text-gray-500">{t('shop.modal_subtitle')}</p>
          </div>

          <div className="rounded-3xl border border-gray-800 bg-gray-900/40 p-6 text-center">
            <p className="text-lg font-black text-white">{itemName}</p>
            {modal.kind === 'miner' && (
              <p className="mt-1 text-sm font-bold text-primary">
                {formatHashrate(Number(modal.item.baseHashRate) || 0)}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-gray-800 bg-gray-900/50 px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
              {t('shop.quantity')}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={t('common.decrease', { defaultValue: 'Diminuir' })}
                disabled={buying || quantity <= 1}
                onClick={() => onSetQuantity((q) => Math.max(1, q - 1))}
                className="rounded-xl border border-gray-700 p-2 text-gray-400 transition-colors hover:text-white disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[2rem] text-center text-lg font-black text-white">{quantity}</span>
              <button
                type="button"
                aria-label={t('common.increase', { defaultValue: 'Aumentar' })}
                disabled={buying || quantity >= maxQty}
                onClick={() => onSetQuantity((q) => Math.min(maxQty, q + 1))}
                className="rounded-xl border border-gray-700 p-2 text-gray-400 transition-colors hover:text-white disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-gray-800 bg-gray-900/50 px-4 py-4">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500">
              {t('shop.total_to_pay')}
            </span>
            <span className="text-xl font-black italic text-white">
              {(unitPrice * quantity).toFixed(2)}{' '}
              <span className="text-xs font-bold not-italic uppercase text-gray-500">{currency}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onConfirm}
            disabled={buying}
            className="flex w-full items-center justify-center gap-3 rounded-[2rem] bg-primary py-5 text-sm font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-primary/20 transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
          >
            {buying ? <Loader2 className="h-5 w-5 animate-spin" /> : t('shop.confirm_payment')}
          </button>

          <div className="flex items-center justify-center gap-2 text-amber-500/50">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-[9px] font-black uppercase tracking-widest">
              {t('shop.irreversible_warning')}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
