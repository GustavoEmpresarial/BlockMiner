import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Lock, PackageMinus, Plus, Zap, X } from 'lucide-react';
import { ImageRackCard } from './ImageRackCard';
import { DEFAULT_RACK_IMAGE_URL, SHOWCASE_RACKS_PER_ROOM, parseVisualFanDrag } from '../lib/inventory2.rackLayout';
import type { RoomPayload, SelectedSlotPayload, UserRackSlot } from '../../machines/lib/machines.types';

export type PendingPlacement =
  | { type: 'rack'; visualIndex: number }
  | { type: 'fan' };

export type StoredRackOption = {
  visualIndex: number;
  rackNumber: number;
};

type VisualRackGroup = {
  rackNumber: number;
  slots: UserRackSlot[];
};

type VisualRackPlacement = {
  visualIndex: number;
  floorSlot: number | null;
};

export type Inventory2RoomContentProps = {
  currentRoom: RoomPayload | null;
  visualRacksOfCurrent: VisualRackGroup[];
  rackOffset: number;
  onSelectSlot: (slot: SelectedSlotPayload) => void;
  onInstall: (rackId: number, inventoryId: number) => void | Promise<void>;
  onDismantleRack: (slots: UserRackSlot[], successMessageKey?: string) => Promise<void>;
  rackDismantleLoading: boolean;
  rackActionBusy: boolean;
  buyingRoom: boolean;
  onBuyRoom: (roomNumber: number) => void;
  placements: VisualRackPlacement[];
  onPlaceRack: (
    visualIndex: number,
    floorSlot: number | null,
    opts?: { silent?: boolean },
  ) => void | Promise<void>;
  mountedFans: number[];
  onMountFan: (visualIndex: number, fromVisualIndex?: number | null) => void | Promise<void>;
  onUnmountFan: (visualIndex: number) => void | Promise<void>;
  onFanNeedsRack: () => void;
  pendingPlacement?: PendingPlacement | null;
  onConsumePendingPlacement?: () => void;
  storedRacks?: StoredRackOption[];
  rackShelfImageUrl?: string;
};

function parseVisualRackIndex(dt: DataTransfer): number | null {
  const raw = dt.getData('visualRackIndex');
  if (raw === '' || raw == null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function RoomDismantleModal({
  open,
  onClose,
  onConfirm,
  displayRoomNumber,
  machineCount,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  displayRoomNumber: number;
  machineCount: number;
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl border-2 border-slate-800 bg-slate-900/95 p-6 shadow-[4px_4px_0px_#000000] space-y-4">
        <h2 className="text-lg font-black uppercase tracking-wider text-white">{t('inventory.dismantle_room')}</h2>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('inventory.room_heading', { room: displayRoomNumber })}</p>
        <p className="text-sm text-amber-300/90 font-medium">{t('inventory.dismantle_room_warning')}</p>
        <p className="text-sm text-slate-300">
          {t('inventory.dismantle_room_confirm', { room: displayRoomNumber, count: machineCount })}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border-2 border-slate-700 bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-300 shadow-[2px_2px_0px_#000000] hover:bg-slate-800 transition-all"
          >
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            disabled={loading}
            className="rounded-xl bg-red-500 hover:bg-red-400 active:translate-x-0.5 active:translate-y-0.5 px-5 py-2 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all disabled:opacity-50"
          >
            {loading ? t('inventory.dismantle_room_loading') : t('inventory.dismantle_room_confirm_button')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StoredRackPickerModal({
  open,
  floorSlot,
  racks,
  shelfImageUrl,
  onClose,
  onPick,
}: {
  open: boolean;
  floorSlot: number | null;
  racks: StoredRackOption[];
  shelfImageUrl: string;
  onClose: () => void;
  onPick: (visualIndex: number) => void;
}) {
  const { t } = useTranslation();
  if (!open || floorSlot == null || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-4 sm:items-center backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl border-2 border-slate-800 bg-slate-900/95 p-5 sm:p-6 shadow-[4px_4px_0px_#000000]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-black uppercase tracking-wider text-white">{t('inventory2.rack_picker_title')}</h2>
            <p className="mt-1 text-xs text-slate-400">{t('inventory2.rack_picker_hint')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700/80 bg-slate-800/80 p-2 text-slate-400 hover:bg-slate-700 hover:text-white shadow-[2px_2px_0px_#000000] transition-colors"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {racks.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{t('inventory2.no_stored_rack')}</p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {racks.map((rack) => (
              <li key={rack.visualIndex}>
                <button
                  type="button"
                  onClick={() => onPick(rack.visualIndex)}
                  className="grid w-full grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border-2 border-slate-800 bg-slate-950/60 p-3 text-left shadow-[2px_2px_0px_#000000] transition-colors hover:border-primary/40 hover:bg-primary/10"
                >
                  <img src={shelfImageUrl} alt="" className="h-14 w-14 object-contain" />
                  <span className="text-sm font-bold text-white">
                    {t('inventory2.rack_name')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Inventory2RoomContent({
  currentRoom,
  visualRacksOfCurrent,
  rackOffset,
  onSelectSlot,
  onInstall,
  onDismantleRack,
  rackDismantleLoading,
  rackActionBusy,
  buyingRoom,
  onBuyRoom,
  placements,
  onPlaceRack,
  mountedFans,
  onMountFan,
  onUnmountFan,
  onFanNeedsRack,
  pendingPlacement = null,
  onConsumePendingPlacement,
  storedRacks = [],
  rackShelfImageUrl = DEFAULT_RACK_IMAGE_URL,
}: Inventory2RoomContentProps) {
  const { t } = useTranslation();
  const [dismantleOpen, setDismantleOpen] = useState(false);
  const [dragOverPad, setDragOverPad] = useState<number | null>(null);
  const [pickerFloorSlot, setPickerFloorSlot] = useState<number | null>(null);

  const occupiedSlots = useMemo(
    () => (currentRoom?.unlocked ? (currentRoom.racks ?? []).filter((r) => r.miner) : []),
    [currentRoom],
  );

  const isShowcaseRoom = currentRoom?.kind === 'showcase_3d';
  const padCount = isShowcaseRoom ? SHOWCASE_RACKS_PER_ROOM : visualRacksOfCurrent.length;
  const placementByFloor = useMemo(() => {
    const map = new Map<number, VisualRackPlacement>();
    for (const p of placements) {
      if (p.floorSlot != null) map.set(p.floorSlot, p);
    }
    return map;
  }, [placements]);

  const handleEmptyPadClick = (floorSlot: number) => {
    if (pendingPlacement?.type === 'rack') {
      void onPlaceRack(pendingPlacement.visualIndex, floorSlot);
      onConsumePendingPlacement?.();
      return;
    }
    if (pendingPlacement?.type === 'fan') {
      onFanNeedsRack();
      return;
    }
    if (storedRacks.length > 0) {
      setPickerFloorSlot(floorSlot);
      return;
    }
    toast.error(t('inventory2.no_stored_rack'));
  };

  const handlePickStoredRack = (visualIndex: number) => {
    if (pickerFloorSlot == null) return;
    void onPlaceRack(visualIndex, pickerFloorSlot);
    setPickerFloorSlot(null);
    onConsumePendingPlacement?.();
  };

  if (!currentRoom) {
    return (
      <div className="flex min-h-64 items-center justify-center" role="tabpanel">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const isShowcase = currentRoom.kind === 'showcase_3d';

  if (!currentRoom.unlocked) {
    return (
      <div role="tabpanel" className="flex min-h-64 flex-col items-center justify-center gap-6 rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-6 text-center sm:p-10 shadow-[4px_4px_0px_#000000]">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-slate-800 bg-slate-950/80 shadow-[2px_2px_0px_#000000]">
          <Lock className="h-7 w-7 text-slate-500" />
        </div>
        <div>
          <p className="text-base font-bold text-slate-300">{t('inventory.room_locked', { room: currentRoom.roomNumber })}</p>
          <p className="mt-1 text-xs text-slate-400 font-medium">{t('inventory.room_locked_desc')}</p>
          {currentRoom.onOffer && currentRoom.listPrice != null && currentRoom.listPrice > (currentRoom.price ?? 0) && (
            <p className="mt-2 text-xs text-slate-400">
              <span className="line-through text-slate-500">{currentRoom.listPrice} BLK</span>
              {' → '}
              <span className="font-bold text-primary">{currentRoom.price} BLK</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onBuyRoom(currentRoom.roomNumber)}
          disabled={buyingRoom}
          className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-hover active:translate-x-0.5 active:translate-y-0.5 px-8 py-3.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[2px_2px_0px_#000000] transition-all disabled:opacity-50"
        >
          {buyingRoom ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
          ) : (
            <>
              <Zap className="h-3.5 w-3.5" />
              {currentRoom.price === 0
                ? t('inventory.unlock_free')
                : t('inventory.buy_room', { price: currentRoom.price })}
            </>
          )}
        </button>
      </div>
    );
  }

  const renderShowcaseFloor = (floorSlot: number) => {
          const placement = placementByFloor.get(floorSlot);
          const rack = placement ? visualRacksOfCurrent[placement.visualIndex] : undefined;

          if (rack && placement) {
            return (
              <div
                key={`pad-${floorSlot}`}
                className={isShowcase ? 'w-full max-w-[46rem]' : undefined}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverPad(floorSlot);
                }}
                onDragLeave={() => setDragOverPad((cur) => (cur === floorSlot ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverPad(null);
                  const idx = parseVisualRackIndex(e.dataTransfer);
                  if (idx != null) void onPlaceRack(idx, floorSlot);
                }}
              >
                <ImageRackCard
                  rackNumber={rackOffset + rack.rackNumber}
                  slots={rack.slots}
                  visualIndex={placement.visualIndex}
                  rackVariant={isShowcase ? 'showcase' : 'shelf'}
                  onSlotClick={onSelectSlot}
                  onSlotDrop={onInstall}
                  onDismantleRack={onDismantleRack}
                  onUnplaceRack={(visualIndex, opts) => void onPlaceRack(visualIndex, null, opts)}
                  fanMounted={isShowcase ? false : mountedFans.includes(placement.visualIndex)}
                  onMountFan={isShowcase ? undefined : (from) => void onMountFan(placement.visualIndex, from)}
                  onUnmountFan={isShowcase ? undefined : () => void onUnmountFan(placement.visualIndex)}
                  fanBaySelectable={!isShowcase && pendingPlacement?.type === 'fan'}
                  onSelectFanBay={
                    isShowcase
                      ? undefined
                      : () => {
                          void onMountFan(placement.visualIndex, null);
                          onConsumePendingPlacement?.();
                        }
                  }
                  rackDismantleLoading={rackDismantleLoading}
                  rackActionBusy={rackActionBusy}
                />
              </div>
            );
          }

          const rackPending = pendingPlacement?.type === 'rack';
          const highlighted = dragOverPad === floorSlot || rackPending;

          if (isShowcase) {
            if (storedRacks.length === 0) {
              return (
                <div
                  key={`empty-${floorSlot}`}
                  aria-label={t('inventory.showcase_pad_empty')}
                  className="flex min-h-24 cursor-default items-center justify-center self-start rounded-3xl border-2 border-dashed border-slate-800 bg-slate-950/40 px-4 py-4 text-slate-600"
                />
              );
            }
            return (
              <button
                key={`empty-${floorSlot}`}
                type="button"
                disabled={rackActionBusy || rackDismantleLoading}
                onClick={() => {
                  if (storedRacks.length === 1) {
                    void onPlaceRack(storedRacks[0].visualIndex, floorSlot);
                    return;
                  }
                  setPickerFloorSlot(floorSlot);
                }}
                aria-label={t('inventory.showcase_install')}
                className="flex min-h-24 items-center justify-center self-start rounded-3xl border-2 border-dashed border-primary/50 bg-primary/10 px-4 py-4 text-xs font-black uppercase tracking-wider text-primary shadow-[2px_2px_0px_#000000] transition-colors hover:bg-primary/20 disabled:pointer-events-none disabled:opacity-40"
              >
                <Plus className="mr-2 h-5 w-5" aria-hidden />
                {t('inventory.showcase_install')}
              </button>
            );
          }

          return (
            <div
              key={`empty-${floorSlot}`}
              role="button"
              tabIndex={0}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverPad(floorSlot);
              }}
              onDragLeave={() => setDragOverPad((cur) => (cur === floorSlot ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverPad(null);
                const idx = parseVisualRackIndex(e.dataTransfer);
                if (idx != null) {
                  void onPlaceRack(idx, floorSlot);
                  return;
                }
                if (parseVisualFanDrag(e.dataTransfer)) onFanNeedsRack();
              }}
              onClick={() => {
                handleEmptyPadClick(floorSlot);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleEmptyPadClick(floorSlot);
                }
              }}
              aria-label={
                rackPending
                  ? t('inventory2.rack_pad_empty_selected')
                  : t('inventory2.rack_pad_empty')
              }
              className={`flex min-h-28 cursor-pointer items-center justify-center self-start rounded-3xl border-2 border-dashed px-4 py-8 transition-colors ${
                highlighted
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-800 bg-slate-950/40 text-slate-500 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              <span
                className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors ${
                  highlighted
                    ? 'border-primary/40 bg-primary/20 text-primary'
                    : 'border-slate-700/80 bg-slate-900/80 text-slate-400'
                }`}
              >
                <Plus className={`h-7 w-7 ${highlighted ? 'animate-pulse' : ''}`} strokeWidth={2.5} aria-hidden />
              </span>
            </div>
          );
  };

  const showcaseFloorSlots = isShowcase ? Array.from({ length: padCount }, (_, floorSlot) => floorSlot) : [];
  const showcaseOccupied = showcaseFloorSlots.filter((floorSlot) => {
    const placement = placementByFloor.get(floorSlot);
    return Boolean(placement && visualRacksOfCurrent[placement.visualIndex]);
  });
  const showcaseEmpty = showcaseFloorSlots.filter((floorSlot) => !showcaseOccupied.includes(floorSlot));

  return (
    <div role="tabpanel" className="space-y-4">
      {(occupiedSlots.length > 0 || isShowcase) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {isShowcase ? (
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {t('inventory.showcase_rack_count', {
                  count: visualRacksOfCurrent.length,
                  max: SHOWCASE_RACKS_PER_ROOM,
                })}
              </p>
              <p className="text-xs font-medium text-slate-500">
                {storedRacks.length > 0
                  ? t('inventory.showcase_credits', { count: storedRacks.length })
                  : t('inventory.showcase_pad_empty')}
              </p>
            </div>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap justify-end gap-2">
          {occupiedSlots.length > 0 && (
          <button
            type="button"
            onClick={() => setDismantleOpen(true)}
            disabled={rackDismantleLoading || rackActionBusy}
            title={t('inventory.dismantle_room_tooltip')}
            aria-label={t('inventory.dismantle_room_aria')}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-red-400 transition-colors hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-40"
          >
            <PackageMinus className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
            {t('inventory.dismantle_room')}
          </button>
          )}
          </div>
        </div>
      )}

      {isShowcase ? (
        <div
          className={
            showcaseOccupied.length > 0 && showcaseEmpty.length > 0
              ? 'grid items-start gap-4 lg:grid-cols-[minmax(22rem,46rem)_minmax(0,1fr)]'
              : showcaseOccupied.length > 0
                ? 'flex flex-wrap items-start gap-4'
                : 'grid grid-cols-2 items-start gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6'
          }
        >
          {showcaseOccupied.length > 0 && (
            <div className={showcaseEmpty.length > 0 ? 'flex min-w-0 flex-col gap-4' : 'contents'}>
              {showcaseOccupied.map((floorSlot) => renderShowcaseFloor(floorSlot))}
            </div>
          )}
          {showcaseEmpty.length > 0 && (
            <div
              className={
                showcaseOccupied.length > 0
                  ? 'grid grid-cols-2 items-start gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
                  : 'contents'
              }
            >
              {showcaseEmpty.map((floorSlot) => renderShowcaseFloor(floorSlot))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {Array.from({ length: padCount }, (_, floorSlot) => renderShowcaseFloor(floorSlot))}
        </div>
      )}

      <RoomDismantleModal
        open={dismantleOpen}
        onClose={() => {
          if (!rackDismantleLoading) setDismantleOpen(false);
        }}
        displayRoomNumber={currentRoom.roomNumber}
        machineCount={occupiedSlots.length}
        loading={rackDismantleLoading}
        onConfirm={async () => {
          try {
            await onDismantleRack(currentRoom.racks ?? [], t('inventory.dismantle_room_success'));
            setDismantleOpen(false);
          } catch {
            /* parent toasts */
          }
        }}
      />

      <StoredRackPickerModal
        open={pickerFloorSlot != null}
        floorSlot={pickerFloorSlot}
        racks={storedRacks}
        shelfImageUrl={rackShelfImageUrl}
        onClose={() => setPickerFloorSlot(null)}
        onPick={handlePickStoredRack}
      />
    </div>
  );
}
