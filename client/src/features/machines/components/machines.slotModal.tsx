import { memo, useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, Trash2, Warehouse } from 'lucide-react';
import {
  formatHashrate,
  getMachineDescriptor,
  inventoryStackKey,
  safeDisplayLabel,
  canMachineFitVisualSlot,
  MODAL_GROUP_PAGE_SIZE,
} from '../lib/machines.shared';
import { getMachineDisplayImageUrl } from '../lib/machineDisplayImage';
import { MachineImage } from './MachineImage';
import type { InventoryStackGroup, SelectedSlotPayload } from '../lib/machines.types';

export type SlotModalProps = {
  slot: SelectedSlotPayload;
  groupedInventory: InventoryStackGroup[];
  onInstall: (rackId: number, inventoryId: number) => Promise<void>;
  onRemove: (rackId: number) => Promise<void>;
  onMoveToVault: (userMinerId: number) => Promise<void>;
  onClose: () => void;
  actionBusy: boolean;
};

/** Ported from legacy/client/src/pages/machines/machines.slotModal.tsx */
export const SlotModal = memo(function SlotModal({ slot, groupedInventory, onInstall, onRemove, onMoveToVault, onClose, actionBusy }: SlotModalProps) {
  const { t } = useTranslation();
  const [confirmingAction, setConfirmingAction] = useState<'inventory' | 'vault' | null>(null);
  const [busy, setBusy] = useState(false);
  const [visibleCount, setVisibleCount] = useState(MODAL_GROUP_PAGE_SIZE);
  const machine = slot.miner || null;

  useEffect(() => {
    setConfirmingAction(null);
    setBusy(false);
    setVisibleCount(MODAL_GROUP_PAGE_SIZE);
  }, [slot, groupedInventory]);

  const visibleInventoryGroups = useMemo(() => groupedInventory.slice(0, visibleCount), [groupedInventory, visibleCount]);
  const hasMoreInventoryGroups = visibleCount < groupedInventory.length;
  const descriptor = machine ? getMachineDescriptor(machine) : null;
  const modalImageUrl = machine ? getMachineDisplayImageUrl({ imageUrl: machine.imageUrl, imageSource: machine.imageSource }) : null;
  const displayNameSafe = machine ? safeDisplayLabel(machine.minerName || descriptor?.name || '') : '';

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-surface border border-gray-800 rounded-[2rem] w-full max-w-[min(100vw-2rem,30rem)] max-h-[calc(100vh-2rem)] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        <div className="px-4 pt-6 pb-4 sm:px-8 sm:pt-8 sm:pb-6 flex items-center justify-between border-b border-gray-800/50">
          <div>
            <h3 className="text-xl font-bold text-white">{machine ? t('inventory.modal.details_title') : t('inventory.modal.install_title')}</h3>
            <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-widest">
              {t('inventory.modal.rack_slot', { rack: slot.visualRackNumber, slot: slot.slotInRack + 1 })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy && !actionBusy) onClose();
            }}
            disabled={busy || actionBusy}
            aria-label={t('common.close')}
            className="w-10 h-10 rounded-xl bg-gray-800/50 text-gray-400 flex items-center justify-center hover:text-white transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus className="w-6 h-6 rotate-45" />
          </button>
        </div>
        <div className="p-4 sm:p-8 max-h-[calc(100vh-18rem)] overflow-y-auto">
          {machine ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 rounded-2xl border border-gray-800/50 bg-gray-800/20 p-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="mx-auto flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-gray-800/50 bg-gray-900/50 p-3 sm:mx-0">
                  <MachineImage imageUrl={modalImageUrl} name={safeDisplayLabel(descriptor?.name || machine?.minerName || '')} className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <h4 className="text-lg font-bold leading-snug text-white break-words">{displayNameSafe || safeDisplayLabel(descriptor?.name || '')}</h4>
                  <div className="mt-2 flex flex-wrap items-start justify-center gap-4 sm:justify-start">
                    <div className="flex flex-col items-center sm:items-start">
                      <span className="text-[10px] font-bold uppercase text-gray-600">{t('inventory.modal.level')}</span>
                      <span className="text-sm font-bold text-gray-300">{machine.level}</span>
                    </div>
                    <div className="flex flex-col items-center sm:items-start">
                      <span className="text-[10px] font-bold uppercase text-gray-600">{t('inventory.modal.hashrate')}</span>
                      <span className="text-sm font-bold uppercase text-primary">{formatHashrate(machine.hashRate)}</span>
                    </div>
                    {Number(machine.slotSize) >= 2 && (
                      <div className="flex flex-col items-center sm:items-start">
                        <span className="text-[10px] font-bold uppercase text-gray-600">{t('inventory.modal.slots')}</span>
                        <span className="text-sm font-bold text-amber-400">{machine.slotSize}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <p className="text-sm text-gray-400 leading-relaxed">{t('inventory.modal.remove_options_intro')}</p>
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      disabled={busy || actionBusy}
                      onClick={async () => {
                        if (busy || actionBusy) return;
                        if (confirmingAction === 'inventory') {
                          const rackIdForRemove = slot.rack?.id;
                          if (rackIdForRemove == null || !Number.isInteger(rackIdForRemove) || rackIdForRemove <= 0) {
                            toast.error(t('common.error'));
                            return;
                          }
                          setBusy(true);
                          try {
                            await onRemove(rackIdForRemove);
                          } finally {
                            setBusy(false);
                          }
                          return;
                        }
                        setConfirmingAction('inventory');
                      }}
                      className={`group flex min-h-11 w-full flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-center text-sm font-bold transition-all disabled:pointer-events-none disabled:opacity-50 sm:flex-row sm:text-left ${
                        confirmingAction === 'inventory'
                          ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20'
                          : 'bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/15 hover:border-red-500/50'
                      }`}
                    >
                      <Trash2 className="w-5 h-5 shrink-0 opacity-90" aria-hidden />
                      <span className="leading-snug whitespace-normal">
                        {confirmingAction === 'inventory' ? t('inventory.modal.confirm_remove_button') : t('inventory.modal.remove_to_inventory')}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || actionBusy || !Number.isFinite(Number(machine.id))}
                      onClick={async () => {
                        if (busy || actionBusy) return;
                        if (confirmingAction === 'vault') {
                          const mid = Number(machine.id);
                          if (!Number.isInteger(mid) || mid <= 0) {
                            toast.error(t('common.error'));
                            return;
                          }
                          setBusy(true);
                          try {
                            await onMoveToVault(mid);
                          } finally {
                            setBusy(false);
                          }
                          return;
                        }
                        setConfirmingAction('vault');
                      }}
                      className={`group flex min-h-11 w-full flex-col items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-center text-sm font-bold transition-all disabled:pointer-events-none disabled:opacity-50 sm:flex-row sm:text-left ${
                        confirmingAction === 'vault'
                          ? 'bg-violet-600 text-white border-violet-500 shadow-lg shadow-violet-600/25'
                          : 'bg-violet-500/15 text-violet-200 border-violet-500/35 hover:bg-violet-500/25 hover:border-violet-400/50'
                      }`}
                    >
                      <Warehouse className="w-5 h-5 shrink-0 opacity-90" aria-hidden />
                      <span className="leading-snug whitespace-normal">
                        {confirmingAction === 'vault' ? t('inventory.modal.confirm_move_warehouse') : t('inventory.modal.move_to_warehouse')}
                      </span>
                    </button>
                  </div>
                  {confirmingAction != null && (
                    <button
                      type="button"
                      disabled={busy || actionBusy}
                      onClick={() => setConfirmingAction(null)}
                      className="min-h-11 w-full rounded-2xl border border-gray-800 bg-gray-900/90 py-3 text-sm font-semibold text-gray-400 transition-all hover:bg-gray-800 hover:text-gray-200 disabled:opacity-50"
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedInventory.length === 0 ? (
                <div className="p-8 text-center bg-gray-800/20 rounded-2xl border border-dashed border-gray-800">
                  <p className="text-gray-500 text-sm">{t('inventory.modal.no_machines_avail')}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {visibleInventoryGroups.map((group) => {
                    const rowAlt = safeDisplayLabel(group.minerName);
                    const rowImageUrl = getMachineDisplayImageUrl({ imageUrl: group.imageUrl, imageSource: group.imageSource });
                    return (
                      <button
                        key={inventoryStackKey(group)}
                        type="button"
                        disabled={busy || actionBusy}
                        onClick={async () => {
                          if (busy || actionBusy) return;
                          if (!canMachineFitVisualSlot(slot.rack, group)) {
                            toast.error(t('inventory.double_slot_row_edge'));
                            return;
                          }
                          const first = group.items.find((item) => item.id > 0);
                          const rackIdForInstall = slot.rack?.id;
                          if (rackIdForInstall == null || !Number.isInteger(rackIdForInstall) || rackIdForInstall <= 0 || !first || !Number.isInteger(first.id) || first.id <= 0) {
                            toast.error(t('common.error'));
                            return;
                          }
                          setBusy(true);
                          try {
                            await onInstall(rackIdForInstall, first.id);
                          } finally {
                            setBusy(false);
                          }
                        }}
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-800/30 p-4 text-left transition-all hover:border-primary/30 hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <div className="flex items-center gap-3 text-left">
                          <div className="w-10 h-10 bg-gray-900 rounded-lg p-2 shrink-0 relative">
                            <MachineImage imageUrl={rowImageUrl} name={rowAlt} className="h-full w-full object-contain" />
                            <div className="absolute -top-2 -right-2 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-lg border border-primary/20">x{group.quantity}</div>
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">{rowAlt}</div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase">{formatHashrate(group.hashRate)}</div>
                          </div>
                        </div>
                        <Plus className="w-5 h-5 text-gray-600" />
                      </button>
                    );
                  })}
                  {hasMoreInventoryGroups && (
                    <button
                      type="button"
                      disabled={busy || actionBusy}
                      onClick={() => setVisibleCount((current) => current + MODAL_GROUP_PAGE_SIZE)}
                      className="min-h-11 w-full rounded-2xl border border-gray-800/70 bg-gray-900/70 px-4 py-3 text-sm font-bold text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-800 disabled:pointer-events-none disabled:opacity-50"
                    >
                      {t('inventory.load_more')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
});
