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
        className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-gray-800 bg-surface p-8 shadow-2xl animate-in zoom-in-95 duration-300"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label={t('common.cancel')}
          className="absolute right-4 top-4 rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-red-500/30 bg-red-500/10">
            <AlertTriangle className="h-8 w-8 text-red-400" aria-hidden />
          </div>
          <div className="space-y-2">
            <h2 id="rack-dismantle-title" className="text-xl font-black uppercase italic tracking-tight text-white">
              {t('inventory.dismantle_rack_confirm', { rack: displayRackNumber })}
            </h2>
            <p className="text-sm text-gray-400">{t('inventory.dismantle_rack_warning')}</p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void onConfirm()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/90 px-6 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-red-500/20 transition-all hover:bg-red-500 active:scale-[0.98] disabled:opacity-50"
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

export type RoomDismantleModalProps = {
  open: boolean;
  roomNumber: number;
  machineCount: number;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/** Room-wide dismantle — not used by inventory2 floor UI yet; keep non-stub for machines.parts. */
export function RoomDismantleModal({
  open,
  onClose,
  roomNumber,
  machineCount,
  loading,
  onConfirm,
}: RoomDismantleModalProps) {
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
        className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-gray-800 bg-surface p-8 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-red-500/30 bg-red-500/10">
            <AlertTriangle className="h-8 w-8 text-red-400" aria-hidden />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-black uppercase italic tracking-tight text-white">
              {t('inventory.dismantle_room_confirm', {
                room: roomNumber,
                count: machineCount,
                defaultValue: `Desmontar sala {{room}} ({{count}} máquinas)?`,
              })}
            </h2>
            <p className="text-sm text-gray-400">
              {t('inventory.dismantle_room_warning', {
                defaultValue: 'Todas as máquinas voltam ao inventário.',
              })}
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => onConfirm()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/90 px-6 py-4 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('inventory.dismantle_rack_confirm_button')}
          </button>
          <button type="button" disabled={loading} onClick={onClose} className="w-full py-2 text-xs font-bold uppercase tracking-widest text-gray-500">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
