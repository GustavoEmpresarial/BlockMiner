/**
 * Colocated helpers for RankingPage — current/client has no shared/utils/machine
 * or inventoryPageGuards. Copied from legacy shared/utils/{machine,inventoryPageGuards}
 * (+ stock-placeholder check matching machines.shared.ts).
 */

export const SLOTS_PER_RACK = 8;
export const RACKS_COUNT = 24;
/** Must match server `RACKS_PER_ROOM` (slots per room, not visual racks). */
export const RACKS_PER_ROOM = 192;
export const SLOT_INDEX_BASE = 1000;
export const DEFAULT_MINER_IMAGE_URL = '/media/miners/reward1.webp';

type LooseRecord = Record<string, unknown>;

function asRecord(machine: object | null | undefined): LooseRecord | null | undefined {
  return machine as LooseRecord | null | undefined;
}

/** First slot index of a visual rack — mirrors server `rackSlotIndex`. */
export function getRoomRackBaseSlot(roomNumber: number, rackIndex: number): number {
  return SLOT_INDEX_BASE + (roomNumber - 1) * RACKS_PER_ROOM + (rackIndex - 1) * SLOTS_PER_RACK;
}

export function getGlobalSlotIndex(
  rackIndex: number,
  localSlotIndex: number,
  roomNumber = 1,
): number {
  return getRoomRackBaseSlot(roomNumber, rackIndex) + localSlotIndex;
}

export function formatHashrate(value: unknown): string {
  const safeValue = Number(value || 0);
  if (!Number.isFinite(safeValue) || safeValue === 0) return '0 H/s';

  const units = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s'];
  let scaled = safeValue;
  let unitIndex = 0;

  while (scaled >= 1000 && unitIndex < units.length - 1) {
    scaled /= 1000;
    unitIndex += 1;
  }

  const precision = scaled >= 100 ? 1 : 2;
  return `${scaled.toFixed(precision)} ${units[unitIndex]}`;
}

function readSlotSize(machine: LooseRecord | null | undefined): number | null {
  const a = machine?.slotSize;
  const b = machine?.slot_size;
  if (Number.isInteger(a)) return a as number;
  if (Number.isInteger(b)) return b as number;
  return null;
}

export function getMachineDescriptor(machine: object | null | undefined): {
  name: string;
  image: string | null;
  size: number;
} {
  const m = asRecord(machine);
  const hashRate = Number(m?.hashRate || m?.hash_rate || 0);
  const slotSize = readSlotSize(m ?? undefined);

  let defaultName = 'Basic Miner';
  let size = slotSize || 1;

  if (hashRate >= 1000) {
    defaultName = 'Quantum Miner';
    size = slotSize || 2;
  } else if (hashRate >= 500) {
    defaultName = 'Elite Miner';
    size = slotSize || 2;
  } else if (hashRate >= 100) {
    defaultName = 'Pro Miner';
    size = slotSize || 2;
  } else if (hashRate >= 50) {
    defaultName = 'Advanced Miner';
    size = slotSize || 1;
  } else if (hashRate >= 10) {
    defaultName = 'Standard Miner';
    size = slotSize || 1;
  }

  const rawImage = m?.imageUrl ?? m?.image_url;
  let image: string | null = null;
  if (typeof rawImage === 'string' && rawImage.trim() !== '') {
    image = rawImage.trim();
  }

  return {
    name: String(m?.minerName || m?.miner_name || m?.name || defaultName),
    image,
    size,
  };
}

export function getMachineBySlot<T extends object>(
  slotIndex: number,
  machines: readonly T[],
): (T & { isSecondSlot?: boolean }) | null {
  const machine = machines.find((row) => {
    const m = asRecord(row);
    return m?.slotIndex === slotIndex || m?.slot_index === slotIndex;
  });
  if (machine) {
    return machine as T & { isSecondSlot?: boolean };
  }

  const previousMachine = machines.find((row) => {
    const m = asRecord(row);
    const pSlot = m?.slotIndex !== undefined ? m.slotIndex : m?.slot_index;
    if (pSlot !== slotIndex - 1) return false;

    const descriptor = getMachineDescriptor(m as object);
    return descriptor.size === 2;
  });

  if (previousMachine) {
    return { ...previousMachine, isSecondSlot: true } as T & { isSecondSlot: true };
  }

  return null;
}

// ─── inventoryPageGuards (minimal) + stock placeholder ─────────────────────

const STOCK_PLACEHOLDER_PATHS = new Set(['/media/brand/icon.webp']);

function isStockPlaceholderMinerImageUrl(url: string | null | undefined): boolean {
  if (typeof url !== 'string') return false;
  const t = url.trim();
  if (!t) return false;
  const pathOnly = t.split('?')[0]?.toLowerCase() ?? '';
  return STOCK_PLACEHOLDER_PATHS.has(pathOnly);
}

function resolveDisplayMachineImageSrc(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed === '' || isStockPlaceholderMinerImageUrl(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return null;
  }
  if (trimmed.startsWith('//')) return null;
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'http:' || u.protocol === 'https:') return trimmed;
  } catch {
    /* ignore */
  }
  return null;
}

export function sanitizeMachineImageSrc(url: unknown, fallback = DEFAULT_MINER_IMAGE_URL): string {
  const resolved = resolveDisplayMachineImageSrc(url);
  if (resolved) return resolved;
  if (typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  if (trimmed === '') return fallback;
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return fallback;
  }
  if (trimmed.startsWith('//')) return fallback;
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'http:' || u.protocol === 'https:') return trimmed;
  } catch {
    /* ignore */
  }
  return fallback;
}
