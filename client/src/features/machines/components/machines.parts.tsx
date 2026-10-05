import type { TFunction } from "i18next";
import { AlertCircle, Box, Calculator, ChevronDown, Lock, Warehouse, Zap } from "lucide-react";
import { getMachineDisplayImageUrl } from '../lib/machineDisplayImage';
import { markShowcase3dDrag } from '../lib/rackMinerModel';
import { MachineImage } from './MachineImage';
import { inventoryStackKey } from '../../../shared/utils/inventoryStackKey';
import type {
  BackpackItem,
  InventoryStackGroup,
  RoomPayload,
} from '../lib/machines.types';
import {
  formatHashrate,
  safeDisplayLabel,
} from '../lib/machines.shared';

export type MachinesHeaderProps = {
  t: TFunction;
  activeMachinesHashRate: number;
  occupiedRacks: number;
  inventoryCount: number;
  onGoToVault: () => void;
  onGoToPowerStats: () => void;
};

export function MachinesHeader({
  t,
  activeMachinesHashRate,
  occupiedRacks,
  inventoryCount,
  onGoToVault,
  onGoToPowerStats,
}: MachinesHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <h1 className="text-3xl font-black text-white tracking-tight uppercase">{t("inventory.title")}</h1>
        <p className="text-slate-400 font-medium text-sm">{t("inventory.subtitle")}</p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-stretch sm:justify-end">
        <button
          type="button"
          onClick={onGoToVault}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-800 bg-slate-900/60 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-300 shadow-[2px_2px_0px_#000000] transition-all hover:border-slate-700 active:translate-y-0.5 sm:w-auto"
        >
          <Warehouse className="h-4 w-4 shrink-0 opacity-90 text-primary" aria-hidden />
          {t("inventory.go_to_warehouse")}
        </button>
        <button
          type="button"
          onClick={onGoToPowerStats}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-800 bg-slate-900/60 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-300 shadow-[2px_2px_0px_#000000] transition-all hover:border-slate-700 active:translate-y-0.5 sm:w-auto"
        >
          <Calculator className="h-4 w-4 shrink-0 opacity-90 text-sky-400" aria-hidden />
          Calculadora
        </button>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <div className="inline-flex min-h-11 flex-1 min-w-[10rem] items-center justify-center gap-1.5 rounded-xl border-2 border-purple-500/30 bg-purple-500/10 px-4 py-2 text-xs font-bold text-purple-300 shadow-[2px_2px_0px_#000000] sm:flex-initial">
            <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {formatHashrate(activeMachinesHashRate)}
          </div>
          <div className="inline-flex min-h-11 flex-1 min-w-[8rem] items-center justify-center rounded-xl border-2 border-slate-800 bg-slate-900/60 px-4 py-2 text-xs font-bold text-slate-300 shadow-[2px_2px_0px_#000000] sm:flex-initial">
            {occupiedRacks} {t("inventory.active_machines")}
          </div>
          <div className="inline-flex min-h-11 flex-1 min-w-[8rem] items-center justify-center rounded-xl border-2 border-primary/30 bg-primary/10 px-4 py-2 text-xs font-bold text-primary shadow-[2px_2px_0px_#000000] sm:flex-initial">
            {inventoryCount} {t("inventory.in_inventory")}
          </div>
        </div>
      </div>
    </div>
  );
}

export type MachinesRoomTabsProps = {
  t: TFunction;
  rooms: RoomPayload[];
  activeRoom: number;
  onSelectRoom: (roomNumber: number) => void;
  /** Optional trailing tab (e.g. inventory2 energy distributor). */
  extraTab?: {
    id: string;
    label: string;
    active: boolean;
    onSelect: () => void;
  };
};

export function MachinesRoomTabs({ t, rooms, activeRoom, onSelectRoom, extraTab }: MachinesRoomTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" role="tablist">
      {rooms.filter((room) => room.kind !== "showcase_3d").map((room) => {
        const isActive = !extraTab?.active && room.roomNumber === activeRoom;
        const isUnlocked = room.unlocked;
        return (
          <button key={room.roomNumber} role="tab" aria-selected={isActive} onClick={() => onSelectRoom(room.roomNumber)}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all border-2 select-none outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              isActive
                ? "border-primary bg-primary/20 text-white shadow-[2px_2px_0px_#000000] translate-y-[-1px]"
                : isUnlocked
                  ? "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:border-slate-700 active:translate-y-0.5"
                  : "border-slate-800 bg-slate-950/40 text-slate-600 opacity-60"
            }`}>
            {!isUnlocked && <Lock className="w-3 h-3" />}
            {room.kind === "showcase_3d" ? t("inventory.showcase_room_label") : `${t("inventory.room_label")} ${room.roomNumber}`}
            {isUnlocked && !isActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
          </button>
        );
      })}
      {extraTab ? (
        <button
          key={extraTab.id}
          type="button"
          role="tab"
          aria-selected={extraTab.active}
          onClick={extraTab.onSelect}
          className={`flex min-h-11 shrink-0 items-center gap-2 rounded-2xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all border-2 select-none outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            extraTab.active
              ? "border-amber-500 bg-amber-500/20 text-white shadow-[2px_2px_0px_#000000] translate-y-[-1px]"
              : "border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:border-slate-700 active:translate-y-0.5"
          }`}
        >
          <Zap className="w-3.5 h-3.5" aria-hidden />
          {extraTab.label}
        </button>
      ) : null}
    </div>
  );
}

export type InventorySidebarProps = {
  t: TFunction;
  inventory: BackpackItem[];
  visibleInventoryGroups: InventoryStackGroup[];
  hasMoreInventoryGroups: boolean;
  rackActionBusy: boolean;
  backpackVaultBusy: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onGoToVault: () => void;
  onOpenWarehouse: (group: InventoryStackGroup) => void;
  onLoadMore: () => void;
};

export function InventorySidebar({
  t,
  inventory,
  visibleInventoryGroups,
  hasMoreInventoryGroups,
  rackActionBusy,
  backpackVaultBusy,
  collapsed,
  onToggleCollapse,
  onGoToVault,
  onOpenWarehouse,
  onLoadMore,
}: InventorySidebarProps) {
  if (collapsed) {
    return (
      <div className="flex w-full shrink-0 flex-col items-center gap-3 transition-[width] duration-300 ease-in-out lg:w-32 lg:sticky lg:top-28">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={false}
          title={t("sidebar.machines")}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-primary/15 px-3 py-2.5 text-primary shadow-lg shadow-primary/10 transition-colors hover:border-primary/60 hover:bg-primary/25"
        >
          <Box className="h-5 w-5 shrink-0" aria-hidden />
          <ChevronDown className="h-4 w-4 shrink-0 -rotate-90" strokeWidth={3} aria-hidden />
        </button>
        <div className="flex max-h-[60vh] w-full flex-col items-center gap-2 overflow-y-auto scrollbar-hide">
          {visibleInventoryGroups.map((group) => {
            const miniImageUrl = getMachineDisplayImageUrl({
              imageUrl: group.imageUrl,
              imageSource: group.imageSource,
            });
            const miniName = safeDisplayLabel(group.minerName);
            const firstId = group.items[0]?.id;
            return (
              <div
                key={inventoryStackKey(group)}
                draggable={!rackActionBusy && !backpackVaultBusy}
                title={`${miniName} x${group.quantity}`}
                onDragStart={(e) => {
                  e.dataTransfer.setData("inventoryId", String(firstId));
                  markShowcase3dDrag(e.dataTransfer, group);
                  e.dataTransfer.effectAllowed = "move";
                }}
                className="relative h-20 w-20 shrink-0 cursor-grab select-none rounded-xl border border-gray-800/50 bg-gray-900/50 p-2.5 transition-colors hover:border-gray-700 active:cursor-grabbing"
              >
                <MachineImage imageUrl={miniImageUrl} name={miniName} className="h-full w-full object-contain" />
                {group.quantity > 1 && (
                  <div className="absolute -right-1.5 -top-1.5 z-[1] rounded-full border border-primary/20 bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                    x{group.quantity}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="w-full shrink-0 space-y-4">
      <div className="rounded-3xl border-2 border-slate-800 bg-slate-900/60 p-4 sm:p-6 shadow-[4px_4px_0px_#000000] lg:sticky top-28">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={true}
            title={t("sidebar.machines")}
            className="flex items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 text-left transition-colors hover:border-primary/30 hover:bg-primary/10"
          >
            <Box className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <h2 className="text-lg font-bold text-white uppercase tracking-wider">{t("sidebar.machines")}</h2>
            <ChevronDown className="h-4 w-4 shrink-0 text-primary" strokeWidth={3} aria-hidden />
          </button>
          <button
            type="button"
            onClick={onGoToVault}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-800 bg-slate-900/60 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-300 shadow-[2px_2px_0px_#000000] transition-all hover:border-slate-700 active:translate-y-0.5 sm:w-auto sm:px-4 sm:text-xs"
          >
            <Warehouse className="h-4 w-4 shrink-0 opacity-90 text-primary" aria-hidden />
            {t("inventory.go_to_warehouse")}
          </button>
        </div>
        {inventory.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center px-4 bg-slate-950/40 rounded-2xl border-2 border-dashed border-slate-800">
            <AlertCircle className="w-10 h-10 text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm font-medium">{t("inventory.empty_inventory")}</p>
            <p className="text-slate-500 text-xs mt-1">{t("inventory.buy_miners_msg")}</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-hide pr-1">
            {visibleInventoryGroups.map((group) => {
              const sideImageUrl = getMachineDisplayImageUrl({
                imageUrl: group.imageUrl,
                imageSource: group.imageSource,
              });
              const sideName = safeDisplayLabel(group.minerName);
              const firstId = group.items[0]?.id;
              return (
                <div
                  key={inventoryStackKey(group)}
                  draggable={!rackActionBusy && !backpackVaultBusy}
                  title={t("inventory.modal.choose_machine")}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("inventoryId", String(firstId));
                    markShowcase3dDrag(e.dataTransfer, group);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className="grid cursor-grab select-none grid-cols-1 grid-rows-[auto_auto] gap-3 rounded-2xl border-2 border-slate-800 bg-slate-900/60 p-4 shadow-[3px_3px_0px_#000000] transition-all hover:border-slate-700 active:cursor-grabbing"
                >
                  <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-3">
                    <div className="relative h-14 w-14 shrink-0 rounded-xl border border-slate-800 bg-slate-950/80 p-2 shadow-[2px_2px_0px_#000000]">
                      <MachineImage
                        imageUrl={sideImageUrl}
                        name={sideName}
                        className="h-full w-full object-contain"
                      />
                      <div className="absolute -right-2 -top-2 z-[1] rounded-full border border-primary/30 bg-primary px-2 py-0.5 text-[10px] font-black text-slate-950 shadow-sm">x{group.quantity}</div>
                    </div>
                    <div className="min-w-0">
                      <h4 className="break-words text-sm font-bold leading-snug text-white">{sideName}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <span className="shrink-0 whitespace-nowrap">
                          {t("inventory.modal.level")} {group.level}
                        </span>
                        <span aria-hidden>·</span>
                        <span className="font-black text-primary">{formatHashrate(group.hashRate)}</span>
                      </div>
                      {group.quantity > 1 && (
                        <p className="mt-1 text-[10px] font-medium normal-case tracking-normal text-slate-400">
                          {t("inventory.backpack_qty_hint", { count: group.quantity - 1 })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div
                    className="col-span-full flex w-full min-w-0 flex-col items-stretch gap-2 border-t border-slate-800/80 pt-3"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      disabled={backpackVaultBusy || !Number.isFinite(Number(firstId))}
                      onClick={() => onOpenWarehouse(group)}
                      className="relative z-[2] flex min-h-11 w-full max-w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-violet-500/35 bg-violet-500/15 px-2 py-2.5 text-center text-[10px] font-black uppercase leading-tight tracking-wider text-violet-300 shadow-[2px_2px_0px_#000000] transition-all hover:bg-violet-500/25 active:translate-y-0.5 disabled:pointer-events-none disabled:opacity-40 sm:flex-row sm:gap-2 sm:px-3 sm:py-2.5 sm:text-[11px]"
                    >
                      <Warehouse className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
                      <span className="max-w-full break-words leading-snug">
                        {t("inventory.backpack_send_warehouse")}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
            {hasMoreInventoryGroups && (
              <button
                type="button"
                onClick={onLoadMore}
                className="min-h-11 w-full rounded-2xl border-2 border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-bold text-slate-300 shadow-[2px_2px_0px_#000000] transition-all hover:border-slate-700 hover:bg-slate-900 active:translate-y-0.5"
              >
                {t("common.load_more", { defaultValue: "Carregar mais" })}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
