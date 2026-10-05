import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, X } from 'lucide-react';

export type RackDismantleModalProps = {
  open: boolean;
  onClose: () => void;
  /** Display number shown to the user (1-based rack label). */
  displayRackNumber: number;
  loading: boolean;
  onConfirm: () => void | Promise<void>;
};

/**
 * Confirm: uninstall all machines on this visual rack → inventory, then store rack + fan.
 * Restored after the inventory2 stub (`return null`) broke the dismantle / store-with-machines flow.
 */
export function RackDismantleModal({
  open,
  onClose,
  displayRackNumber,
  loading,
  onConfirm,
}: RackDismantleModalProps) {
  const { t } = useTranslation();
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md animate-in fade-in duration-300"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rack-dismantle-title"
        className="relative w-full max-w-md overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900/95 p-6 sm:p-8 shadow-[4px_4px_0px_#000000] animate-in zoom-in-95 duration-200"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label={t('common.cancel')}
          className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-red-500/30 bg-red-500/10 shadow-[2px_2px_0px_#000000]">
            <AlertTriangle className="h-7 w-7 text-red-400" aria-hidden />
          </div>
          <div className="space-y-2">
            <h2 id="rack-dismantle-title" className="text-lg sm:text-xl font-black uppercase tracking-wider text-white">
              {t('inventory.dismantle_rack_confirm', { rack: displayRackNumber })}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 font-medium">{t('inventory.dismantle_rack_warning')}</p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 hover:bg-red-400 active:translate-x-0.5 active:translate-y-0.5 px-6 py-3.5 text-xs font-black uppercase tracking-widest text-slate-950 shadow-[2px_2px_0px_#000000] transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {t('inventory.dismantle_rack_loading')}
              </>
            ) : (
              t('inventory.dismantle_rack_confirm_button')
            )}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="w-full py-2 text-xs font-bold uppercase tracking-widest text-gray-500 transition-colors hover:text-white disabled:opacity-40"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// RoomDismantleModal used to be exported here too, for machines.parts.tsx's
// MachinesRoomContent. Both were dead (never imported by the live /inventory
// screen, which uses Inventory2RoomContent's own local RoomDismantleModal
// instead) and MachinesRoomContent had two real, TypeScript-confirmed bugs
// (a wrong prop name into this component, and a read of RoomPayload.price
// which doesn't exist on the type) — removed together rather than fixed
// forward, 2026-09-12.
