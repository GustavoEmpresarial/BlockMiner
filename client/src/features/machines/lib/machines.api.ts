/**
 * Endpoints used by the "Minhas Máquinas" screen (`/dashboard/machines`).
 * Rooms + inventory + vault are mounted in current/server bootstrap.
 */
import { api } from '../../../shared/auth/auth.store';

export const MACHINES_API = {
  rooms: '/rooms',
  inventory: '/inventory',
  roomsBuy: '/rooms/buy',
  rackInstall: '/rooms/rack/install',
  rackUninstall: '/rooms/rack/uninstall',
  rackUninstallBatch: '/rooms/rack/uninstall-batch',
  vault: '/vault',
  vaultMove: '/vault/move-to-vault',
  vaultRetrieve: '/vault/retrieve-from-vault',
} as const;

export function getRooms(signal?: AbortSignal) {
  return api.get(MACHINES_API.rooms, { timeout: 25000, signal });
}

export function getInventory(signal?: AbortSignal) {
  return api.get(MACHINES_API.inventory, { timeout: 25000, signal });
}

export function getVault(signal?: AbortSignal) {
  return api.get(MACHINES_API.vault, { timeout: 25000, signal });
}

export function postBuyRoom() {
  return api.post(MACHINES_API.roomsBuy);
}

export function postRackInstall(rackId: number, inventoryId: number) {
  return api.post(MACHINES_API.rackInstall, { rackId, inventoryId });
}

export function postRackUninstall(rackId: number) {
  return api.post(MACHINES_API.rackUninstall, { rackId });
}

export function postRackUninstallBatch(rackIds: number[]) {
  return api.post(MACHINES_API.rackUninstallBatch, { rackIds });
}

export function postMoveToVault(body: {
  source: 'inventory' | 'rack';
  itemId?: number;
  itemIds?: number[];
}) {
  return api.post(MACHINES_API.vaultMove, body);
}

export function getVisualPlacements(signal?: AbortSignal) {
  return api.get<{
    ok: boolean;
    rooms: Array<{
      roomId: number;
      roomNumber: number;
      visualCount: number;
      placements: Array<{ visualIndex: number; floorSlot: number | null }>;
    }>;
  }>('/rooms/visual-placements', { timeout: 15000, signal });
}

export function postVisualPlacement(body: { roomNumber: number; visualIndex: number; floorSlot: number | null }) {
  return api.post<{
    ok: boolean;
    placements: Array<{ visualIndex: number; floorSlot: number | null }>;
    message?: string;
    code?: string;
  }>('/rooms/visual-placements', body);
}

export function getFanPlacements(signal?: AbortSignal) {
  return api.get<{
    ok: boolean;
    fanCredits?: number;
    rooms: Array<{
      roomId: number;
      roomNumber: number;
      visualCount: number;
      mounted: number[];
    }>;
  }>('/rooms/fan-placements', { timeout: 15000, signal });
}

export function postFanPlacement(body: {
  roomNumber: number;
  visualIndex: number;
  mounted: boolean;
  fromVisualIndex?: number | null;
}) {
  return api.post<{
    ok: boolean;
    mounted: number[];
    fanCredits?: number;
    message?: string;
    code?: string;
  }>('/rooms/fan-placements', body);
}

export function postRetrieveFromVault(body: {
  destination: 'inventory' | 'rack';
  vaultId?: number;
  vaultIds?: number[];
  slotIndex?: number;
}) {
  return api.post(MACHINES_API.vaultRetrieve, body);
}
