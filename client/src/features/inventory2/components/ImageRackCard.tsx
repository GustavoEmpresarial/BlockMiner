import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { GripVertical, PackageMinus, Plus, X, Zap } from 'lucide-react';
import {
  formatHashrate,
  sumRackHashRate,
  getMachineDescriptor,
  RACK_TOOLTIP_SHOW_MS,
  safeDisplayLabel,
  parsePositiveIntFromDrag,
} from '../../machines/lib/machines.shared';
import { getMachineDisplayImageUrl } from '../../machines/lib/machineDisplayImage';
import { MachineImage } from '../../machines/components/MachineImage';
import { RackMachineTooltipPortal } from '../../machines/components/machines.tooltip';
import { RackDismantleModal } from '../../machines/components/machines.dismantleModal';
import type { MachineTipState, SelectedSlotPayload, UserRackSlot } from '../../machines/lib/machines.types';
import {
  DEFAULT_RACK_IMAGE_URL,
  VISUAL_FAN_DRAG,
  VISUAL_FAN_FROM_DRAG,
  computeSlotOverlayStyle,
  parseVisualFanDrag,
  parseVisualFanFromDrag,
} from '../lib/inventory2.rackLayout';
import { CoolingFanUnit } from './CoolingFanUnit';

export type ImageRackCardProps = {
  rackNumber: number;
  slots: UserRackSlot[];
  onSlotClick: (slot: SelectedSlotPayload) => void;
  onSlotDrop: (rackId: number, inventoryId: number) => void | Promise<void>;
  onDismantleRack: (slots: UserRackSlot[], successMessageKey?: string) => Promise<void>;
  rackDismantleLoading: boolean;
  rackActionBusy: boolean;
  visualIndex?: number;
  onUnplaceRack?: (visualIndex: number, opts?: { silent?: boolean }) => void | Promise<void>;
  fanMounted?: boolean;
  onMountFan?: (fromVisualIndex?: number | null) => void | Promise<void>;
  onUnmountFan?: () => void | Promise<void>;
  fanBaySelectable?: boolean;
  onSelectFanBay?: () => void;
};

export const ImageRackCard = memo(function ImageRackCard({
  rackNumber,
  slots,
  onSlotClick,
  onSlotDrop,
  onDismantleRack,
  rackDismantleLoading,
  rackActionBusy,
  visualIndex,
  onUnplaceRack,
  fanMounted = false,
  onMountFan,
  onUnmountFan,
  fanBaySelectable = false,
  onSelectFanBay,
}: ImageRackCardProps) {
  const { t } = useTranslation();
  const [dragOverId, setDragOverId] = useState<number | string | null>(null);
  const [confirmingDismantle, setConfirmingDismantle] = useState(false);
  const [machineTip, setMachineTip] = useState<MachineTipState | null>(null);
  const [hoverFinePointer, setHoverFinePointer] = useState(false);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setHoverFinePointer(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current != null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const cancelScheduledHide = useCallback(() => {
    clearHideTimer();
  }, [clearHideTimer]);

  /** Always cancel pending show — otherwise leave→show race leaves a stuck portal tip. */
  const hideMachineTipNow = useCallback(() => {
    clearShowTimer();
    clearHideTimer();
    setMachineTip(null);
  }, [clearShowTimer, clearHideTimer]);

  const showMachineTipNow = useCallback(
    (anchorEl: HTMLElement, payload: Omit<MachineTipState, 'anchorEl'>) => {
      clearShowTimer();
      cancelScheduledHide();
      setMachineTip({ anchorEl, ...payload });
    },
    [clearShowTimer, cancelScheduledHide],
  );

  const scheduleShowMachineTip = useCallback(
    (anchorEl: HTMLElement, payload: Omit<MachineTipState, 'anchorEl'>) => {
      clearShowTimer();
      cancelScheduledHide();
      showTimerRef.current = window.setTimeout(() => {
        showTimerRef.current = null;
        setMachineTip({ anchorEl, ...payload });
      }, RACK_TOOLTIP_SHOW_MS);
    },
    [clearShowTimer, cancelScheduledHide],
  );

  useEffect(
    () => () => {
      clearShowTimer();
      clearHideTimer();
    },
    [clearShowTimer, clearHideTimer],
  );

  // Safety net: scroll / outside click / Escape dismisses a stuck portal tip.
  useEffect(() => {
    if (!machineTip) return undefined;
    const dismiss = () => hideMachineTipNow();
    const onPointerDown = (event: PointerEvent) => {
      const anchor = machineTip.anchorEl;
      const target = event.target;
      if (anchor && target instanceof Node && (anchor === target || anchor.contains(target))) return;
      dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [machineTip, hideMachineTipNow]);

  // Drop tip when switching racks (not on every slots identity churn).
  useEffect(() => {
    hideMachineTipNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only rack identity
  }, [rackNumber]);

  const hasMachines = slots.some((s) => s?.miner);
  const rackHashRate = sumRackHashRate(slots);
  const rackPowerLabel = formatHashrate(rackHashRate);

  return (
    <div className={`overflow-hidden rounded-3xl border bg-surface shadow-xl ${hasMachines ? 'rack-live border-primary/30' : 'border-gray-800/50'}`}>
      <div className="flex items-center justify-between gap-2 border-b border-gray-800/50 bg-gray-800/20 px-3 py-2.5 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`h-2 w-2 shrink-0 rounded-full ${hasMachines ? 'animate-pulse bg-emerald-500 shadow-glow' : 'bg-gray-600'}`} />
          {visualIndex != null && (
            <button
              type="button"
              draggable={!rackActionBusy && !rackDismantleLoading}
              onDragStart={(e) => {
                e.dataTransfer.setData('visualRackIndex', String(visualIndex));
                e.dataTransfer.effectAllowed = 'move';
              }}
              aria-label={t('inventory2.drag_handle_aria')}
              title={t('inventory2.drag_handle_aria')}
              className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-lg border border-white/10 bg-slate-900/60 text-slate-400 active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" aria-hidden />
            </button>
          )}
          <h3 className="truncate text-sm font-bold text-gray-300">{t('inventory2.rack_name')}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        {visualIndex != null && onUnplaceRack && (
          <button
            type="button"
            onClick={() => {
              // Store with machines → same confirm as dismantle (uninstall + store rack/fan).
              if (hasMachines) {
                setConfirmingDismantle(true);
                return;
              }
              void onUnplaceRack(visualIndex);
            }}
            disabled={rackDismantleLoading || rackActionBusy}
            title={hasMachines ? t('inventory.dismantle_rack_tooltip') : t('inventory2.unplace')}
            aria-label={hasMachines ? t('inventory.dismantle_rack_aria') : t('inventory2.unplace_aria')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-300 transition-colors hover:bg-sky-500/20 disabled:pointer-events-none disabled:opacity-40"
          >
            <PackageMinus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </button>
        )}
        {rackHashRate > 0 && (
          <span
            aria-label={t('inventory.rack_total_power_aria', { power: rackPowerLabel })}
            className="inline-flex items-center gap-1 rounded-lg border border-primary/25 bg-primary/10 px-2 py-1"
          >
            <Zap className="h-3 w-3 text-primary" aria-hidden />
            <span className="text-[10px] font-black tabular-nums text-primary">{rackPowerLabel}</span>
          </span>
        )}
        {hasMachines && (
          <button
            type="button"
            onClick={() => setConfirmingDismantle(true)}
            disabled={rackDismantleLoading || rackActionBusy}
            title={t('inventory.dismantle_rack_tooltip')}
            aria-label={t('inventory.dismantle_rack_aria')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-40"
          >
            <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </button>
        )}
        </div>
      </div>
      <div className="relative w-full">
        <img src={DEFAULT_RACK_IMAGE_URL} alt="" className="block h-auto w-full select-none" draggable={false} />
        {hasMachines && <div className="rack-scan" aria-hidden />}
        <div className="absolute inset-0">
          {(() => {
            const rendered = [];
            let i = 0;
            while (i < slots.length) {
              const slotIndex = i;
              const rack = slots[slotIndex];
              const machine = rack ? rack.miner : null;
              const descriptor = machine ? getMachineDescriptor(machine) : null;
              const isOccupied = !!machine;
              const isBlocked = !machine && !!rack?.blockedByMinerId;
              const isDoubleSlot = isOccupied && machine != null && Number(machine.slotSize) >= 2;
              const slotKey = rack?.id ?? slotIndex;
              const isDragTarget = dragOverId === slotKey;

              if (isBlocked) {
                i++;
                continue;
              }

              const overlay = computeSlotOverlayStyle(slotIndex, isDoubleSlot ? 2 : 1);
              if (!overlay) {
                i++;
                continue;
              }

              const displayName = machine ? safeDisplayLabel(machine.minerName || descriptor?.name || '') : '';
              const hashrateStr = machine ? formatHashrate(machine.hashRate) : '';
              const slotSizeNum = machine ? Math.max(1, Number(machine.slotSize) || 1) : 1;
              const stableSlotKey = rack?.id ?? slotIndex;
              const occupiedAria = machine
                ? t('inventory.rack_slot_machine_aria', { name: displayName, power: hashrateStr, slots: slotSizeNum })
                : t('inventory.slot_empty_tooltip');

              const machineTipPayload: Omit<MachineTipState, 'anchorEl'> = {
                slotKey: stableSlotKey,
                displayName,
                hashrateStr,
                slotSize: slotSizeNum,
              };

              rendered.push(
                <button
                  key={rack ? rack.id : slotIndex}
                  type="button"
                  disabled={rackActionBusy || rackDismantleLoading}
                  aria-label={occupiedAria}
                  onClick={() => onSlotClick({ rack, miner: machine, visualRackNumber: rackNumber, slotInRack: slotIndex })}
                  style={overlay}
                  onDragOver={
                    !isOccupied && !rackActionBusy
                      ? (e) => {
                          e.preventDefault();
                          setDragOverId(slotKey);
                        }
                      : undefined
                  }
                  onDragLeave={!isOccupied && !rackActionBusy ? () => setDragOverId(null) : undefined}
                  onDrop={
                    !isOccupied && !rackActionBusy
                      ? (e) => {
                          e.preventDefault();
                          setDragOverId(null);
                          const invId = parsePositiveIntFromDrag(e.dataTransfer.getData('inventoryId'));
                          const rid = rack?.id;
                          if (invId != null && Number.isInteger(rid) && rid! > 0) onSlotDrop(rid!, invId);
                        }
                      : undefined
                  }
                  onMouseEnter={
                    isOccupied && hoverFinePointer
                      ? (e) => {
                          cancelScheduledHide();
                          clearShowTimer();
                          const anchor = e.currentTarget;
                          if (machineTip) {
                            showMachineTipNow(anchor, machineTipPayload);
                          } else {
                            scheduleShowMachineTip(anchor, machineTipPayload);
                          }
                        }
                      : undefined
                  }
                  onMouseLeave={
                    isOccupied && hoverFinePointer
                      ? () => {
                          // Immediate hide + cancel pending show (delayed hide alone can race).
                          hideMachineTipNow();
                        }
                      : undefined
                  }
                  onFocus={
                    isOccupied
                      ? (e) => {
                          clearShowTimer();
                          cancelScheduledHide();
                          showMachineTipNow(e.currentTarget, machineTipPayload);
                        }
                      : undefined
                  }
                  onBlur={
                    isOccupied
                      ? () => {
                          clearShowTimer();
                          clearHideTimer();
                          setMachineTip(null);
                        }
                      : undefined
                  }
                  className={`group absolute flex min-h-0 flex-col items-center justify-end overflow-hidden border-0 p-1 text-center transition-colors duration-200 ${
                    isOccupied
                      ? 'bg-transparent'
                      : isDragTarget
                        ? 'bg-primary/20'
                        : 'bg-transparent hover:bg-white/5'
                  }`}
                >
                  {isOccupied && machine ? (
                    <div
                      className="rack-machine-idle pointer-events-none flex h-full w-full items-end justify-center pb-1"
                      style={{ animationDelay: `${(slotIndex % 8) * 0.18}s` }}
                    >
                      <MachineImage
                        key={`${machine.id}-${machine.imageUrl ?? ''}`}
                        imageUrl={getMachineDisplayImageUrl({ imageUrl: machine.imageUrl, imageSource: machine.imageSource })}
                        name={displayName}
                        className="max-h-[92%] max-w-full object-contain object-bottom transition-transform group-hover:scale-105"
                      />
                    </div>
                  ) : isDragTarget ? (
                    <Plus className="mb-6 h-6 w-6 shrink-0 animate-pulse text-primary" aria-hidden />
                  ) : (
                    <Plus className="mb-6 h-5 w-5 shrink-0 text-transparent transition-colors group-hover:text-gray-400" aria-hidden />
                  )}
                </button>,
              );
              i++;
            }
            return rendered;
          })()}
        </div>
      </div>
      {visualIndex != null && onMountFan ? (
        <div
          className={`border-t px-3 py-3 sm:px-5 sm:py-4 ${
            dragOverId === 'fan-bay'
              ? 'border-sky-400/40 bg-sky-500/10'
              : fanMounted
                ? 'border-gray-800/50 bg-slate-950/50'
                : 'border-dashed border-slate-800 bg-slate-950/30'
          }`}
          onDragOver={
            !rackActionBusy
              ? (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverId('fan-bay');
                }
              : undefined
          }
          onDragLeave={() => setDragOverId((v) => (v === 'fan-bay' ? null : v))}
          onDrop={
            !rackActionBusy
              ? (e) => {
                  const fromSidebar = parseVisualFanDrag(e.dataTransfer);
                  const fromRack = parseVisualFanFromDrag(e.dataTransfer);
                  if (!fromSidebar && fromRack == null) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverId(null);
                  if (fanMounted && (fromRack == null || fromRack === visualIndex)) return;
                  void onMountFan(fromRack);
                }
              : undefined
          }
        >
          {fanMounted ? (
            <div className="relative">
              {onUnmountFan ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onUnmountFan();
                  }}
                  disabled={rackDismantleLoading || rackActionBusy}
                  title={t('inventory2.unplace_fan')}
                  aria-label={t('inventory2.unplace_fan_aria')}
                  className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-slate-950/90 text-sky-300 shadow-lg transition-colors hover:bg-sky-500/20 disabled:pointer-events-none disabled:opacity-40"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                </button>
              ) : null}
              <div
                draggable={!rackActionBusy && !rackDismantleLoading}
                onDragStart={(e) => {
                  e.dataTransfer.setData(VISUAL_FAN_DRAG, '1');
                  e.dataTransfer.setData(VISUAL_FAN_FROM_DRAG, String(visualIndex));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                aria-label={t('inventory2.drag_fan_aria')}
                title={t('inventory2.drag_fan_aria')}
                className="block w-full cursor-grab rounded-2xl outline-none ring-sky-400/30 transition-shadow hover:ring-2 active:cursor-grabbing"
              >
                <CoolingFanUnit spinning />
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={rackActionBusy || rackDismantleLoading}
              onClick={() => {
                if (onSelectFanBay) onSelectFanBay();
                else void onMountFan?.(null);
              }}
              aria-label={
                fanBaySelectable ? t('inventory2.fan_bay_empty_selected') : t('inventory2.fan_bay_empty')
              }
              className={`flex min-h-28 w-full cursor-pointer items-center justify-center rounded-2xl border border-dashed px-3 py-4 transition-colors sm:min-h-36 ${
                fanBaySelectable
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-700/80 text-slate-400 hover:border-slate-500 hover:text-slate-200'
              }`}
            >
              <span
                className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${
                  fanBaySelectable
                    ? 'border-primary/40 bg-primary/20 text-primary'
                    : 'border-slate-700/80 bg-slate-900/80'
                }`}
              >
                <Plus
                  className={`h-6 w-6 ${fanBaySelectable ? 'animate-pulse' : ''}`}
                  strokeWidth={2.5}
                  aria-hidden
                />
              </span>
            </button>
          )}
        </div>
      ) : null}
      <RackMachineTooltipPortal
        open={Boolean(machineTip)}
        anchorEl={machineTip?.anchorEl ?? null}
        displayName={machineTip?.displayName ?? ''}
        hashrateStr={machineTip?.hashrateStr ?? ''}
        slotSize={machineTip?.slotSize ?? 1}
      />
      <RackDismantleModal
        open={confirmingDismantle}
        onClose={() => !rackDismantleLoading && setConfirmingDismantle(false)}
        displayRackNumber={rackNumber}
        loading={rackDismantleLoading}
        onConfirm={async () => {
          try {
            await onDismantleRack(slots);
            if (visualIndex != null && onUnplaceRack) {
              await onUnplaceRack(visualIndex, { silent: true });
            }
            setConfirmingDismantle(false);
          } catch {
            /* Errors and toasts are handled in the parent handler */
          }
        }}
      />
    </div>
  );
});
