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
      <div className="relative w-full max-w-md animate-in zoom-in-95 overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900/95 shadow-[4px_4px_0px_#000000] duration-200">
        <button
          type="button"
          aria-label={t('common.close', { defaultValue: 'Fechar' })}
          disabled={buying}
          onClick={() => !buying && onClose()}
          className="absolute right-4 top-4 p-2 rounded-xl border border-slate-700/80 bg-slate-800/80 text-slate-400 hover:text-white shadow-[2px_2px_0px_#000000] transition-colors disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-6 p-6 sm:p-8">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-primary/30 bg-primary/10 shadow-[2px_2px_0px_#000000]">
              {modal.kind === 'fan' ? (
                <Wind className="h-8 w-8 text-cyan-400" />
              ) : modal.kind === 'rack' ? (
                <Boxes className="h-8 w-8 text-amber-400" />
              ) : (
                <ShoppingCart className="h-8 w-8 text-primary" />
              )}
            </div>
            <h3 id="shop-modal-title" className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
              {t('shop.modal_title')}
            </h3>
            <p className="font-medium text-xs sm:text-sm text-slate-400">{t('shop.modal_subtitle')}</p>
          </div>

          <div className="rounded-2xl border-2 border-slate-800 bg-slate-950/60 p-5 text-center shadow-[2px_2px_0px_#000000]">
            <p className="text-lg font-black text-white">{itemName}</p>
            {modal.kind === 'miner' && (
              <p className="mt-1 text-sm font-bold text-primary font-mono">
                {formatHashrate(Number(modal.item.baseHashRate) || 0)}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-2xl border-2 border-slate-800 bg-slate-950/60 px-4 py-3 shadow-[2px_2px_0px_#000000]">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('shop.quantity')}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label={t('common.decrease', { defaultValue: 'Diminuir' })}
                disabled={buying || quantity <= 1}
                onClick={() => onSetQuantity((q) => Math.max(1, q - 1))}
                className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[2rem] text-center text-lg font-black text-white font-mono">{quantity}</span>
              <button
                type="button"
                aria-label={t('common.increase', { defaultValue: 'Aumentar' })}
                disabled={buying || quantity >= maxQty}
                onClick={() => onSetQuantity((q) => Math.min(maxQty, q + 1))}
                className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border-2 border-slate-800 bg-slate-950/60 px-4 py-4 shadow-[2px_2px_0px_#000000]">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {t('shop.total_to_pay')}
            </span>
            <span className="text-xl font-black text-white font-mono">
              {(unitPrice * quantity).toFixed(2)}{' '}
              <span className="text-xs font-bold uppercase text-slate-400">{currency}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onConfirm}
            disabled={buying}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary hover:bg-primary-hover active:translate-x-0.5 active:translate-y-0.5 py-4 text-xs font-black uppercase tracking-widest text-slate-950 shadow-[2px_2px_0px_#000000] transition-all disabled:opacity-50"
          >
            {buying ? <Loader2 className="h-5 w-5 animate-spin" /> : t('shop.confirm_payment')}
          </button>

          <div className="flex items-center justify-center gap-2 text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-[10px] font-black uppercase tracking-wider">
              {t('shop.irreversible_warning')}
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
