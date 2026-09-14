import { isAxiosError } from "axios";
import { inventoryStackKey } from "../../../shared/utils/inventoryStackKey";
import type {
  BackpackItem,
  InventoryStackGroup,
  MachineImageSource,
  UserRackSlot,
  VisualRackGroup,
} from './machines.types';


/**
 * Mirrors VAULT_BULK_MAX in server/modules/wallet/vault/vault.schemas.ts — the zod schema
 * rejects any itemIds/vaultIds array longer than this with a 400. Without the client
 * enforcing the same ceiling, a user with more than 120 identical stacked machines can
 * build a request that is guaranteed to fail, and the server's single 400 code for that
 * branch (VAULT_INVALID_SELECTION) reads as "choose at least one" — the opposite of what
 * happened. Keep the two in sync.
 */
export const VAULT_BULK_MAX = 120;

export const RACK_TOOLTIP_SHOW_MS = 120;
export const RACK_TOOLTIP_HIDE_MS = 80;
export const SLOTS_PER_VISUAL_RACK = 8;
export const SIDEBAR_GROUP_PAGE_SIZE = 24;
export const MODAL_GROUP_PAGE_SIZE = 18;
export const SOCKET_REFRESH_DEBOUNCE_MS = 160;

export function sumRackHashRate(slots: UserRackSlot[]): number {
  let total = 0;
  for (const slot of slots) {
    if (!slot?.miner) continue;
    const hr = Number(slot.miner.hashRate);
    if (Number.isFinite(hr)) total += hr;
  }
  return total;
}

export function groupIntoRacks(racks: UserRackSlot[]): VisualRackGroup[] {
  const groups: VisualRackGroup[] = [];
  for (let r = 0; r < Math.ceil(racks.length / SLOTS_PER_VISUAL_RACK); r++) {
    groups.push({
      rackNumber: r + 1,
      slots: racks.slice(r * SLOTS_PER_VISUAL_RACK, (r + 1) * SLOTS_PER_VISUAL_RACK),
    });
  }
  return groups;
}


export function canMachineFitVisualSlot(
  slot: UserRackSlot | null | undefined,
  machine: (Partial<BackpackItem> & { slotSize?: number | null }) | null | undefined
): boolean {
  if (!slot || !machine) return false;
  const slotSize = Math.max(1, Number(machine.slotSize) || 1);
  if (slotSize <= 1) return true;
  const position = Number(slot.position);
  if (!Number.isInteger(position)) return false;
  return position % 4 <= 4 - slotSize;
}


export function groupInventoryStacks(rows: BackpackItem[]): InventoryStackGroup[] {
  const groups: Record<string, InventoryStackGroup> = {};
  for (const item of rows) {
    const key = inventoryStackKey(item);
    if (!groups[key]) groups[key] = { ...item, quantity: 1, items: [item] };
    else {
      groups[key].quantity += 1;
      groups[key].items.push(item);
    }
  }
  return Object.values(groups).sort(
    (a, b) => Number(b.hashRate || 0) - Number(a.hashRate || 0)
  );
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === "object" && data !== null && "message" in data) {
      const m = (data as { message?: unknown }).message;
      if (typeof m === "string" && m.length > 0) return m;
    }
  }
  return fallback;
}

export { inventoryStackKey } from '../../../shared/utils/inventoryStackKey';

export const DEFAULT_MINER_IMAGE_URL = '/media/miners/reward1.webp';

const BRAND_ICON_PATHS = new Set(['/media/brand/icon.webp']);

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isBlockedBrandIcon(url: unknown): boolean {
  const trimmed = trimString(url);
  if (!trimmed) return false;
  const path = trimmed.split('?')[0]?.toLowerCase() ?? '';
  return BRAND_ICON_PATHS.has(path);
}

function firstUsableImage(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const trimmed = trimString(candidate);
    if (trimmed && !isBlockedBrandIcon(trimmed)) return trimmed;
  }
  return null;
}

export function formatHashrate(value: unknown): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return '0 H/s';
  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let scaled = n;
  let unitIndex = 0;
  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }
  const decimals = scaled >= 100 ? 1 : 2;
  return `${scaled.toFixed(decimals)} ${units[unitIndex]}`;
}

export function getMachineDescriptor(row: unknown): { name: string; image: string | null; size: number } {
  const record = row as Record<string, unknown> | null | undefined;
  const hashRate = Number(record?.hashRate ?? record?.hash_rate ?? 0);
  const slotRaw = record?.slotSize ?? record?.slot_size;
  const slotParsed = Number.isInteger(slotRaw) ? Number(slotRaw) : null;
  let name = 'Basic Miner';
  let size = slotParsed || 1;
  if (hashRate >= 1000) {
    name = 'Quantum Miner';
    size = slotParsed || 2;
  } else if (hashRate >= 500) {
    name = 'Elite Miner';
    size = slotParsed || 2;
  } else if (hashRate >= 100) {
    name = 'Pro Miner';
    size = slotParsed || 2;
  } else if (hashRate >= 50) {
    name = 'Advanced Miner';
    size = slotParsed || 1;
  } else if (hashRate >= 10) {
    name = 'Standard Miner';
    size = slotParsed || 1;
  }
  const imageRaw = record?.imageUrl ?? record?.image_url;
  const image = typeof imageRaw === 'string' && imageRaw.trim() !== '' ? imageRaw.trim() : null;
  const displayName = String(record?.minerName ?? record?.miner_name ?? record?.name ?? name);
  return { name: displayName, image, size };
}

export function safeDisplayLabel(value: unknown, maxLen = 240): string {
  if (value == null) return '';
  const cleaned = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen)}…`;
}

export function resolveOwnedMachineImageUrl(input: {
  apiImageUrl?: string | null;
  apiImageSource?: MachineImageSource;
  catalogImageUrl?: string | null;
  ownedMachineImageUrl?: string | null;
  rowImageUrl?: string | null;
}): { imageUrl: string | null; imageSource: MachineImageSource } {
  if (input.apiImageSource && input.apiImageUrl !== undefined) {
    const apiUrl = trimString(input.apiImageUrl);
    if (apiUrl && !isBlockedBrandIcon(apiUrl)) {
      return { imageUrl: apiUrl, imageSource: input.apiImageSource };
    }
    if (input.apiImageSource === 'none') {
      return { imageUrl: null, imageSource: 'none' };
    }
  }
  const catalog = firstUsableImage(input.catalogImageUrl);
  if (catalog) return { imageUrl: catalog, imageSource: 'catalog_current' };
  const owned = firstUsableImage(input.ownedMachineImageUrl, input.rowImageUrl);
  if (owned) return { imageUrl: owned, imageSource: 'owned_snapshot' };
  return { imageUrl: null, imageSource: 'none' };
}

export function parsePositiveIntFromDrag(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolveDisplayMachineImageSrc(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || isBlockedBrandIcon(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    trimmed.startsWith('//')
  ) {
    return null;
  }
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return trimmed;
  } catch {
    return null;
  }
  return null;
}

export function dedupeOccupiedSlotsForDismantle(slots: UserRackSlot[]): UserRackSlot[] {
  const seenMinerIds = new Set<number>();
  const out: UserRackSlot[] = [];
  for (const slot of slots || []) {
    const slotId = Number(slot.id);
    if (!slot?.miner || !Number.isInteger(slotId)) continue;
    const minerId = slot.miner.id;
    if (minerId == null || seenMinerIds.has(minerId)) continue;
    seenMinerIds.add(minerId);
    out.push(slot);
  }
  return out;
}
