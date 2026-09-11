import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import axios, { isAxiosError } from 'axios';
import { useGameStore } from '../shell/lib/game.store';
import {
  getRooms,
  getInventory,
  postBuyRoom,
  postRackInstall,
  postRackUninstall,
  postRackUninstallBatch,
  postMoveToVault,
  getVisualPlacements,
  postVisualPlacement,
  getFanPlacements,
  postFanPlacement,
} from '../machines/lib/machines.api';
import {
  dedupeOccupiedSlotsForDismantle,
  groupIntoRacks,
  canMachineFitVisualSlot,
  groupInventoryStacks,
  apiErrorMessage,
  SIDEBAR_GROUP_PAGE_SIZE,
} from '../machines/lib/machines.shared';
import { resolveApiPayloadMessage } from '../../shared/utils/apiErrorI18n';
import { SlotModal } from '../machines/components/machines.slotModal';
import { MachineQuantityModal } from '../machines/components/machines.quantityModal';
import { InventorySidebar, MachinesHeader, MachinesRoomTabs } from '../machines/components/machines.parts';
import type { BackpackItem, InventoryStackGroup, RoomPayload, RoomsSummaryState, SelectedSlotPayload, UserRackSlot, VisualRackPlacement } from '../machines/lib/machines.types';
import {
  applyOptimisticInstall,
  applyOptimisticInventoryToVault,
  applyOptimisticRackToVault,
  applyOptimisticUninstall,
  applyOptimisticUninstallSlots,
} from '../machines/lib/machines.optimistic';
import { Inventory2RoomContent, type PendingPlacement } from './components/Inventory2RoomContent';
import { Inventory2Distributor } from './components/Inventory2Distributor';
import { DEFAULT_RACK_IMAGE_URL } from './lib/inventory2.rackLayout';

const INVENTORY_REFRESH_DEBOUNCE_MS = 160;

/**
 * Visual sandbox of /inventory: same rooms/inventory APIs, image-based rack furniture.
 * Mutations here change the live farm (intentional).
 */
export default function Inventory2Page() {
  const { t } = useTranslation();
  const location = useLocation();
  const initSocket = useGameStore((s) => s.initSocket);
  const socket = useGameStore((s) => s.socket);
  const [rooms, setRooms] = useState<RoomPayload[]>([]);
  const [inventory, setInventory] = useState<BackpackItem[]>([]);
  const [summary, setSummary] = useState<RoomsSummaryState>({ totalRacks: 0, occupiedRacks: 0, freeRacks: 0 });
  const [loading, setLoading] = useState(true);
  const [buyingRoom, setBuyingRoom] = useState(false);
  const [rackDismantleLoading, setRackDismantleLoading] = useState(false);
  const [rackActionBusy, setRackActionBusy] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlotPayload | null>(null);
  const [activeRoom, setActiveRoom] = useState(1);
  const [pendingPlacement, setPendingPlacement] = useState<PendingPlacement | null>(null);
  const [showDistributor, setShowDistributor] = useState(false);
  const [inventoryCollapsed, setInventoryCollapsed] = useState(false);
  const [visibleInventoryGroupsCount, setVisibleInventoryGroupsCount] = useState(SIDEBAR_GROUP_PAGE_SIZE);
  const [placementsByRoom, setPlacementsByRoom] = useState<Record<number, VisualRackPlacement[]>>({});
  const [fansByRoom, setFansByRoom] = useState<Record<number, number[]>>({});
  const [fanCredits, setFanCredits] = useState(0);
  const [backpackWarehouseModal, setBackpackWarehouseModal] = useState<InventoryStackGroup | null>(null);
  const [backpackVaultBusy, setBackpackVaultBusy] = useState(false);
  const navigate = useNavigate();
  const latestFetchIdRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const rackMutationLock = useRef(false);
  const buyRoomLock = useRef(false);
  const backpackVaultLock = useRef(false);
  const dismantleLock = useRef(false);
  const farmRef = useRef({ rooms, inventory, summary });
  farmRef.current = { rooms, inventory, summary };

  const commitFarm = useCallback((next: { rooms: RoomPayload[]; inventory: BackpackItem[]; summary: RoomsSummaryState }) => {
    farmRef.current = next;
    setRooms(next.rooms);
    setInventory(next.inventory);
    setSummary(next.summary);
  }, []);

  const fetchData = useCallback(async ({ background = false } = {}) => {
    const requestId = ++latestFetchIdRef.current;
    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;
    try {
      if (!background) setLoading(true);
      const signal = ac.signal;
      const [roomsOutcome, invOutcome, placeOutcome, fanOutcome] = await Promise.allSettled([
        getRooms(signal),
        getInventory(signal),
        getVisualPlacements(signal),
        getFanPlacements(signal),
      ]);
      if (requestId !== latestFetchIdRef.current) return;

      if (roomsOutcome.status === 'fulfilled') {
        const roomsRes = roomsOutcome.value;
        if (roomsRes.data?.ok && Array.isArray(roomsRes.data.rooms)) {
          const nextRooms = roomsRes.data.rooms as RoomPayload[];
          const nextSummary = {
            totalRacks: Number(roomsRes.data.totalRacks) || 0,
            occupiedRacks: Number(roomsRes.data.occupiedRacks) || 0,
            freeRacks: Number(roomsRes.data.freeRacks) || 0,
          };
          setRooms(nextRooms);
          setSummary(nextSummary);
          farmRef.current = { ...farmRef.current, rooms: nextRooms, summary: nextSummary };
        }
      } else if (!axios.isCancel(roomsOutcome.reason)) {
        console.error('inventory2: rooms fetch failed', roomsOutcome.reason);
      }

      if (invOutcome.status === 'fulfilled') {
        const invRes = invOutcome.value;
        if (invRes.data?.ok && Array.isArray(invRes.data.inventory)) {
          const rows = invRes.data.inventory.filter(
            (row: unknown): row is BackpackItem =>
              row != null && typeof row === 'object' && 'id' in row && Number.isInteger(Number((row as { id: unknown }).id)) && Number((row as { id: unknown }).id) > 0,
          );
          setInventory(rows);
          farmRef.current = { ...farmRef.current, inventory: rows };
        }
      } else if (!axios.isCancel(invOutcome.reason)) {
        console.error('inventory2: inventory fetch failed', invOutcome.reason);
      }

      if (placeOutcome.status === 'fulfilled' && placeOutcome.value.data?.ok) {
        const next: Record<number, VisualRackPlacement[]> = {};
        for (const room of placeOutcome.value.data.rooms) {
          next[room.roomNumber] = room.placements;
        }
        setPlacementsByRoom(next);
      } else if (placeOutcome.status === 'rejected' && !axios.isCancel(placeOutcome.reason)) {
        console.error('inventory2: placements fetch failed', placeOutcome.reason);
      }

      if (fanOutcome.status === 'fulfilled' && fanOutcome.value.data?.ok) {
        const nextFans: Record<number, number[]> = {};
        for (const room of fanOutcome.value.data.rooms) {
          nextFans[room.roomNumber] = room.mounted;
        }
        setFansByRoom(nextFans);
        if (typeof fanOutcome.value.data.fanCredits === 'number') {
          setFanCredits(Math.max(0, fanOutcome.value.data.fanCredits));
        }
      } else if (fanOutcome.status === 'rejected' && !axios.isCancel(fanOutcome.reason)) {
        console.error('inventory2: fan placements fetch failed', fanOutcome.reason);
      }

      const roomsRejectedCancel = roomsOutcome.status === 'rejected' && axios.isCancel(roomsOutcome.reason);
      const invRejectedCancel = invOutcome.status === 'rejected' && axios.isCancel(invOutcome.reason);
      const roomsBad = roomsOutcome.status === 'rejected' ? !roomsRejectedCancel : !roomsOutcome.value?.data?.ok;
      const invBad = invOutcome.status === 'rejected' ? !invRejectedCancel : !invOutcome.value?.data?.ok;
      if (requestId === latestFetchIdRef.current && (roomsBad || invBad)) {
        toast.error(t('inventory.load_error'));
      }
    } catch (e) {
      if (!axios.isCancel(e) && requestId === latestFetchIdRef.current) {
        toast.error(t('inventory.load_error'));
      }
    } finally {
      if (requestId === latestFetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    initSocket();
    void fetchData();
    return () => {
      fetchAbortRef.current?.abort();
      if (refreshTimerRef.current != null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [fetchData, initSocket]);

  const scheduleBackgroundRefresh = useCallback(() => {
    if (refreshTimerRef.current != null) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void fetchData({ background: true });
    }, INVENTORY_REFRESH_DEBOUNCE_MS);
  }, [fetchData]);

  useEffect(() => {
    if (!socket) return;
    socket.on('inventory:update', scheduleBackgroundRefresh);
    socket.on('machines:update', scheduleBackgroundRefresh);
    return () => {
      socket.off('inventory:update', scheduleBackgroundRefresh);
      socket.off('machines:update', scheduleBackgroundRefresh);
    };
  }, [socket, scheduleBackgroundRefresh]);

  useEffect(() => {
    const onInventoryChanged = () => scheduleBackgroundRefresh();
    window.addEventListener('bm-inventory-changed', onInventoryChanged);
    return () => window.removeEventListener('bm-inventory-changed', onInventoryChanged);
  }, [scheduleBackgroundRefresh]);

  useEffect(() => {
    const state = location.state as { refreshInventory?: boolean } | null;
    if (!state?.refreshInventory) return;
    void fetchData({ background: true });
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, fetchData, navigate]);

  const handleBuyRoom = useCallback(
    async (roomNumber: number) => {
      if (!Number.isInteger(roomNumber) || roomNumber < 1) {
        toast.error(t('common.error'));
        return;
      }
      if (buyRoomLock.current) return;
      buyRoomLock.current = true;
      setBuyingRoom(true);
      try {
        const res = await postBuyRoom();
        if (res.data.ok) {
          toast.success(t('inventory.room_unlocked', { room: roomNumber }));
          setActiveRoom(roomNumber);
          await fetchData({ background: true });
        } else {
          toast.error(resolveApiPayloadMessage(res.data, t('common.error')));
        }
      } catch (err) {
        toast.error(apiErrorMessage(err, t('common.error')));
      } finally {
        buyRoomLock.current = false;
        setBuyingRoom(false);
      }
    },
    [fetchData, t],
  );

  const handleInstall = useCallback(
    async (rackId: number, inventoryId: number) => {
      if (!Number.isInteger(rackId) || rackId <= 0 || !Number.isInteger(inventoryId) || inventoryId <= 0) {
        toast.error(t('common.error'));
        return;
      }
      if (rackMutationLock.current) return;
      const targetRack = rooms.flatMap((room) => ('racks' in room ? room.racks || [] : [])).find((rack) => rack.id === rackId);
      const inventoryItem = inventory.find((item) => item.id === inventoryId);
      if (inventoryItem && !canMachineFitVisualSlot(targetRack, inventoryItem)) {
        toast.error(t('inventory.double_slot_row_edge'));
        return;
      }
      rackMutationLock.current = true;
      setRackActionBusy(true);
      try {
        const res = await postRackInstall(rackId, inventoryId);
        if (res.data.ok) {
          toast.success(t('inventory.install_success'));
          setSelectedSlot(null);
          if (inventoryItem) commitFarm(applyOptimisticInstall(farmRef.current, rackId, inventoryItem));
          rackMutationLock.current = false;
          setRackActionBusy(false);
          void fetchData({ background: true });
          return;
        }
        toast.error(resolveApiPayloadMessage(res.data, t('common.error')));
        await fetchData({ background: true });
      } catch (err) {
        toast.error(apiErrorMessage(err, t('common.error')));
        await fetchData({ background: true }).catch(() => {});
      } finally {
        rackMutationLock.current = false;
        setRackActionBusy(false);
      }
    },
    [commitFarm, fetchData, inventory, rooms, t],
  );

  const handleRemove = useCallback(
    async (rackId: number) => {
      if (!Number.isInteger(rackId) || rackId <= 0) {
        toast.error(t('common.error'));
        return;
      }
      if (rackMutationLock.current) return;
      rackMutationLock.current = true;
      setRackActionBusy(true);
      try {
        const res = await postRackUninstall(rackId);
        if (res.data.ok) {
          toast.success(t('inventory.remove_success'));
          setSelectedSlot(null);
          commitFarm(applyOptimisticUninstall(farmRef.current, rackId));
          rackMutationLock.current = false;
          setRackActionBusy(false);
          void fetchData({ background: true });
          return;
        }
        toast.error(resolveApiPayloadMessage(res.data, t('common.error')));
        await fetchData({ background: true });
      } catch (err) {
        toast.error(apiErrorMessage(err, t('common.error')));
        await fetchData({ background: true }).catch(() => {});
      } finally {
        rackMutationLock.current = false;
        setRackActionBusy(false);
      }
    },
    [commitFarm, fetchData, t],
  );

  const handleMoveInventoryToVault = useCallback(
    async (inventoryItemIds: number[] | number) => {
      const ids = (Array.isArray(inventoryItemIds) ? inventoryItemIds : [inventoryItemIds]).map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length === 0) {
        toast.error(t('common.error'));
        return;
      }
      if (backpackVaultLock.current) return;
      backpackVaultLock.current = true;
      setBackpackVaultBusy(true);
      try {
        const body = ids.length === 1 ? { source: 'inventory' as const, itemId: ids[0]! } : { source: 'inventory' as const, itemIds: ids };
        await postMoveToVault(body);
        setBackpackWarehouseModal(null);
        commitFarm(applyOptimisticInventoryToVault(farmRef.current, ids));
        backpackVaultLock.current = false;
        setBackpackVaultBusy(false);
        void fetchData({ background: true });
      } catch (err) {
        toast.error(apiErrorMessage(err, t('vault.move_error')));
        backpackVaultLock.current = false;
        setBackpackVaultBusy(false);
      }
    },
    [commitFarm, fetchData, t],
  );

  const handleMoveRackToVault = useCallback(
    async (userMinerId: number) => {
      const id = Number(userMinerId);
      if (!Number.isInteger(id) || id <= 0) {
        toast.error(t('common.error'));
        return;
      }
      if (rackMutationLock.current) return;
      rackMutationLock.current = true;
      setRackActionBusy(true);
      try {
        await postMoveToVault({ source: 'rack', itemId: id });
        setSelectedSlot(null);
        commitFarm(applyOptimisticRackToVault(farmRef.current, id));
        rackMutationLock.current = false;
        setRackActionBusy(false);
        void fetchData({ background: true });
      } catch (err) {
        if (isAxiosError(err) && err.response?.status === 409) {
          toast.error(t('vault.errors.VAULT_RACK_LINK'));
        } else {
          toast.error(apiErrorMessage(err, t('vault.move_error')));
        }
        rackMutationLock.current = false;
        setRackActionBusy(false);
      }
    },
    [commitFarm, fetchData, t],
  );

  const handleRemoveRackSlots = useCallback(
    async (rackSlots: UserRackSlot[], successMessage?: string) => {
      const occupied = dedupeOccupiedSlotsForDismantle(rackSlots || []);
      if (occupied.length === 0) return;
      if (dismantleLock.current) return;
      dismantleLock.current = true;
      setRackDismantleLoading(true);
      setRackActionBusy(true);
      try {
        const res = await postRackUninstallBatch(occupied.map((s) => s.id as number));
        if (!res.data?.ok) {
          toast.error(resolveApiPayloadMessage(res.data, t('common.error')));
          await fetchData({ background: true });
          throw new Error('UNINSTALL_FAILED');
        }
        toast.success(successMessage || t('inventory.dismantle_rack_success'));
        commitFarm(applyOptimisticUninstallSlots(farmRef.current, occupied));
        dismantleLock.current = false;
        setRackDismantleLoading(false);
        setRackActionBusy(false);
        void fetchData({ background: true });
      } catch (err) {
        if (err instanceof Error && err.message !== 'UNINSTALL_FAILED') {
          toast.error(apiErrorMessage(err, t('common.error')));
          await fetchData({ background: true });
        }
        dismantleLock.current = false;
        setRackDismantleLoading(false);
        setRackActionBusy(false);
        throw err;
      }
    },
    [commitFarm, fetchData, t],
  );

  const groupedInventory = useMemo(() => groupInventoryStacks(inventory), [inventory]);
  const visibleInventoryGroups = useMemo(
    () => groupedInventory.slice(0, visibleInventoryGroupsCount),
    [groupedInventory, visibleInventoryGroupsCount],
  );
  const hasMoreInventoryGroups = visibleInventoryGroupsCount < groupedInventory.length;

  useEffect(() => {
    setVisibleInventoryGroupsCount(SIDEBAR_GROUP_PAGE_SIZE);
  }, [groupedInventory.length]);

  useEffect(() => {
    if (inventory.length > 0) setInventoryCollapsed(false);
  }, [inventory.length]);

  const activeMachinesHashRate = useMemo(
    () =>
      rooms
        .flatMap((r) => (r.unlocked && 'racks' in r ? r.racks : []))
        .filter((rack) => rack.miner)
        .reduce((sum, rack) => sum + Number(rack.miner?.hashRate || 0), 0),
    [rooms],
  );

  const currentRoom = useMemo(() => rooms.find((room) => room.roomNumber === activeRoom) ?? null, [rooms, activeRoom]);
  const visualRacksOfCurrent = useMemo(() => {
    if (!currentRoom?.unlocked) return [];
    return groupIntoRacks(currentRoom.racks);
  }, [currentRoom]);
  const rackOffset = currentRoom ? (currentRoom.roomNumber - 1) * 24 : 0;
  const handleSelectRackToPlace = useCallback((visualIndex: number) => {
    setPendingPlacement((prev) => (prev?.type === 'rack' && prev.visualIndex === visualIndex ? null : { type: 'rack', visualIndex }));
  }, []);

  const handleSelectFanToPlace = useCallback(() => {
    setPendingPlacement((prev) => (prev?.type === 'fan' ? null : { type: 'fan' }));
  }, []);

  const handleSelectSlot = useCallback((slot: SelectedSlotPayload) => {
    setBackpackWarehouseModal(null);
    setSelectedSlot(slot);
  }, []);

  const currentPlacements = useMemo(() => {
    const saved = currentRoom ? placementsByRoom[currentRoom.roomNumber] : null;
    if (saved && saved.length > 0) return saved;
    return visualRacksOfCurrent.map((_, i) => ({ visualIndex: i, floorSlot: i }));
  }, [currentRoom, placementsByRoom, visualRacksOfCurrent]);
  const storedRacks = useMemo(
    () =>
      currentPlacements
        .filter((p) => p.floorSlot == null)
        .map((p) => ({ visualIndex: p.visualIndex, rackNumber: rackOffset + p.visualIndex + 1 })),
    [currentPlacements, rackOffset],
  );

  const handlePlaceRack = useCallback(
    async (visualIndex: number, floorSlot: number | null, opts?: { silent?: boolean }) => {
      if (!currentRoom?.unlocked) return;
      try {
        const res = await postVisualPlacement({ roomNumber: currentRoom.roomNumber, visualIndex, floorSlot });
        if (res.data?.ok && Array.isArray(res.data.placements)) {
          setPlacementsByRoom((prev) => ({ ...prev, [currentRoom.roomNumber]: res.data.placements }));
          if (floorSlot == null) {
            setFansByRoom((prev) => ({
              ...prev,
              [currentRoom.roomNumber]: (prev[currentRoom.roomNumber] ?? []).filter((i) => i !== visualIndex),
            }));
          }
          if (!opts?.silent) {
            toast.success(floorSlot == null ? t('inventory2.stored') : t('inventory2.placed'));
          }
          return;
        }
        toast.error(res.data?.message || t('inventory2.place_error'));
        return;
      } catch (err: unknown) {
        const code = isAxiosError(err) ? (err.response?.data as { code?: string } | undefined)?.code : undefined;
        toast.error(
          code === 'RACK_NOT_EMPTY'
            ? t('inventory2.unplace_not_empty')
            : apiErrorMessage(err, t('inventory2.place_error')),
        );
        // Do not rethrow — callers use `void handlePlaceRack(...)`; a rethrow becomes
        // unhandledrejection noise in client-error reports (expected validation 400s).
      }
    },
    [currentRoom, t],
  );

  const currentMountedFans = currentRoom ? fansByRoom[currentRoom.roomNumber] ?? [] : [];
  const storedFanCount = fanCredits;

  const commitFans = useCallback(
    (mounted: number[]) => {
      if (!currentRoom) return;
      setFansByRoom((prev) => ({ ...prev, [currentRoom.roomNumber]: mounted }));
    },
    [currentRoom],
  );

  const handleMountFan = useCallback(
    async (visualIndex: number, fromVisualIndex?: number | null) => {
      if (!currentRoom?.unlocked) return;
      try {
        const res = await postFanPlacement({
          roomNumber: currentRoom.roomNumber,
          visualIndex,
          mounted: true,
          fromVisualIndex: fromVisualIndex ?? null,
        });
        if (res.data?.ok && Array.isArray(res.data.mounted)) {
          commitFans(res.data.mounted);
          if (typeof res.data.fanCredits === 'number') setFanCredits(Math.max(0, res.data.fanCredits));
          toast.success(t('inventory2.fan_mounted'));
          return;
        }
        toast.error(res.data?.message || t('inventory2.fan_error'));
      } catch (err: unknown) {
        const code = isAxiosError(err) ? (err.response?.data as { code?: string } | undefined)?.code : undefined;
        toast.error(
          code === 'FAN_NEED_RACK'
            ? t('inventory2.fan_need_rack')
            : code === 'FAN_NO_CREDITS'
            ? t('inventory2.fan_no_credits')
            : apiErrorMessage(err, t('inventory2.fan_error')),
        );
      }
    },
    [commitFans, currentRoom, t],
  );

  const handleUnmountFan = useCallback(
    async (visualIndex: number) => {
      if (!currentRoom?.unlocked) return;
      try {
        const res = await postFanPlacement({
          roomNumber: currentRoom.roomNumber,
          visualIndex,
          mounted: false,
        });
        if (res.data?.ok && Array.isArray(res.data.mounted)) {
          commitFans(res.data.mounted);
          if (typeof res.data.fanCredits === 'number') setFanCredits(Math.max(0, res.data.fanCredits));
          toast.success(t('inventory2.fan_stored'));
          return;
        }
        toast.error(res.data?.message || t('inventory2.fan_error'));
      } catch (err: unknown) {
        toast.error(apiErrorMessage(err, t('inventory2.fan_error')));
      }
    },
    [commitFans, currentRoom, t],
  );

  if (loading)
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6 pb-20 duration-700">
      <MachineQuantityModal
        open={Boolean(backpackWarehouseModal)}
        onClose={() => !backpackVaultBusy && setBackpackWarehouseModal(null)}
        title={t('inventory.backpack_qty_modal_title')}
        subtitle={t('inventory.backpack_qty_modal_subtitle')}
        quantityLabel={t('inventory.backpack_qty_field')}
        max={backpackWarehouseModal?.quantity ?? 1}
        min={1}
        confirmLabel={t('inventory.backpack_qty_confirm')}
        cancelLabel={t('common.cancel')}
        busy={backpackVaultBusy}
        onConfirm={(q: number) => {
          const group = backpackWarehouseModal;
          if (!group) return;
          const qty = Math.min(Math.max(1, Math.floor(Number(q)) || 1), group.quantity);
          const sorted = [...group.items].sort((a, b) => a.id - b.id);
          void handleMoveInventoryToVault(sorted.slice(0, qty).map((r) => r.id));
        }}
      />

      <MachinesHeader
        t={t}
        activeMachinesHashRate={activeMachinesHashRate}
        occupiedRacks={summary.occupiedRacks}
        inventoryCount={inventory.length + storedRacks.length + storedFanCount}
        onGoToVault={() => navigate('/vault')}
        onGoToPowerStats={() => navigate('/power-stats')}
      />

      <MachinesRoomTabs
        t={t}
        rooms={rooms}
        activeRoom={activeRoom}
        onSelectRoom={(roomNumber) => {
          setShowDistributor(false);
          setActiveRoom(roomNumber);
          setPendingPlacement(null);
        }}
        extraTab={{
          id: 'distributor',
          label: t('inventory2.distributor_tab'),
          active: showDistributor,
          onSelect: () => setShowDistributor(true),
        }}
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
        <div className="min-w-0 lg:flex-1">
          {showDistributor ? (
            <Inventory2Distributor farmHashRate={activeMachinesHashRate} />
          ) : (
          <Inventory2RoomContent
            currentRoom={currentRoom}
            visualRacksOfCurrent={visualRacksOfCurrent}
            rackOffset={rackOffset}
            onSelectSlot={handleSelectSlot}
            onInstall={handleInstall}
            onDismantleRack={handleRemoveRackSlots}
            rackDismantleLoading={rackDismantleLoading}
            rackActionBusy={rackActionBusy}
            buyingRoom={buyingRoom}
            onBuyRoom={handleBuyRoom}
            placements={currentPlacements}
            onPlaceRack={handlePlaceRack}
            mountedFans={currentMountedFans}
            onMountFan={handleMountFan}
            onUnmountFan={handleUnmountFan}
            onFanNeedsRack={() => toast.error(t('inventory2.fan_need_rack'))}
            pendingPlacement={pendingPlacement}
            onConsumePendingPlacement={() => setPendingPlacement(null)}
            storedRacks={storedRacks}
            rackShelfImageUrl={DEFAULT_RACK_IMAGE_URL}
          />
          )}
        </div>
        <InventorySidebar
          t={t}
          inventory={inventory}
          visibleInventoryGroups={visibleInventoryGroups}
          hasMoreInventoryGroups={hasMoreInventoryGroups}
          rackActionBusy={rackActionBusy}
          backpackVaultBusy={backpackVaultBusy}
          collapsed={inventoryCollapsed}
          onToggleCollapse={() => setInventoryCollapsed((c) => !c)}
          onGoToVault={() => navigate('/vault')}
          onOpenWarehouse={setBackpackWarehouseModal}
          onLoadMore={() => setVisibleInventoryGroupsCount((current) => Math.min(current + SIDEBAR_GROUP_PAGE_SIZE, groupedInventory.length))}
        />
      </div>

      {selectedSlot && (
        <SlotModal
          slot={selectedSlot}
          groupedInventory={groupedInventory}
          onInstall={handleInstall}
          onRemove={handleRemove}
          onMoveToVault={handleMoveRackToVault}
          actionBusy={rackActionBusy}
          onClose={() => {
            setSelectedSlot(null);
            setBackpackWarehouseModal(null);
          }}
        />
      )}
    </div>
  );
}
