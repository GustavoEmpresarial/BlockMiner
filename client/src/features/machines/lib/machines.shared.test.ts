import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import {
  canMachineFitVisualSlot,
  groupIntoRacks,
  groupInventoryStacks,
  dedupeOccupiedSlotsForDismantle,
  formatHashrate,
  getMachineDescriptor,
  parsePositiveIntFromDrag,
  resolveDisplayMachineImageSrc,
  resolveOwnedMachineImageUrl,
  sumRackHashRate,
  apiErrorMessage,
  safeDisplayLabel,
  SLOTS_PER_VISUAL_RACK,
} from './machines.shared';
import type { BackpackItem, UserRackSlot } from './machines.types';

function slot(overrides: Partial<UserRackSlot> = {}): UserRackSlot {
  return { id: 1, position: 0, miner: null, installedAt: null, blockedByMinerId: null, ...overrides };
}

function backpackItem(overrides: Partial<BackpackItem> = {}): BackpackItem {
  return { id: 1, minerId: 1, minerName: 'Miner', hashRate: 10, slotSize: 1, ...overrides };
}

describe('sumRackHashRate', () => {
  it('sums only occupied slots and ignores non-finite/absent hashrates', () => {
    const slots = [
      slot({ id: 1, miner: { id: 1, hashRate: 100 } }),
      slot({ id: 2, miner: null }),
      slot({ id: 3, miner: { id: 3, hashRate: 'NaN' as unknown as number } }),
      slot({ id: 4, miner: { id: 4, hashRate: 50 } }),
    ];
    expect(sumRackHashRate(slots)).toBe(150);
  });

  it('returns 0 for an empty slot list', () => {
    expect(sumRackHashRate([])).toBe(0);
  });
});

describe('groupIntoRacks', () => {
  it(`chunks slots into groups of ${SLOTS_PER_VISUAL_RACK}`, () => {
    const slots = Array.from({ length: 20 }, (_, i) => slot({ id: i }));
    const groups = groupIntoRacks(slots);
    expect(groups).toHaveLength(3);
    expect(groups[0]!.slots).toHaveLength(8);
    expect(groups[1]!.slots).toHaveLength(8);
    expect(groups[2]!.slots).toHaveLength(4);
    expect(groups.map((g) => g.rackNumber)).toEqual([1, 2, 3]);
  });

  it('returns an empty array for no slots', () => {
    expect(groupIntoRacks([])).toEqual([]);
  });
});

describe('canMachineFitVisualSlot', () => {
  it('rejects a null slot or machine', () => {
    expect(canMachineFitVisualSlot(null, backpackItem())).toBe(false);
    expect(canMachineFitVisualSlot(slot(), null)).toBe(false);
  });

  it('always fits a 1-slot machine regardless of position', () => {
    expect(canMachineFitVisualSlot(slot({ position: 3 }), backpackItem({ slotSize: 1 }))).toBe(true);
  });

  it('rejects a 2-slot machine at the last column of a 4-wide row (would overflow into the next row)', () => {
    expect(canMachineFitVisualSlot(slot({ position: 3 }), backpackItem({ slotSize: 2 }))).toBe(false);
  });

  it('accepts a 2-slot machine when it fits within the row', () => {
    expect(canMachineFitVisualSlot(slot({ position: 0 }), backpackItem({ slotSize: 2 }))).toBe(true);
    expect(canMachineFitVisualSlot(slot({ position: 2 }), backpackItem({ slotSize: 2 }))).toBe(true);
  });

  it('rejects when slot.position is not an integer', () => {
    expect(canMachineFitVisualSlot(slot({ position: NaN }), backpackItem({ slotSize: 2 }))).toBe(false);
  });

  it('treats a falsy/zero slotSize as 1 (always fits)', () => {
    expect(canMachineFitVisualSlot(slot({ position: 3 }), backpackItem({ slotSize: 0 }))).toBe(true);
  });
});

describe('groupInventoryStacks', () => {
  it('groups identical items together and counts quantity', () => {
    const rows = [
      backpackItem({ id: 1, minerId: 5, hashRate: 100 }),
      backpackItem({ id: 2, minerId: 5, hashRate: 100 }),
      backpackItem({ id: 3, minerId: 6, hashRate: 50 }),
    ];
    const groups = groupInventoryStacks(rows);
    expect(groups).toHaveLength(2);
    const stackOfFive = groups.find((g) => g.minerId === 5)!;
    expect(stackOfFive.quantity).toBe(2);
    expect(stackOfFive.items).toHaveLength(2);
  });

  it('sorts groups by hashrate descending', () => {
    const rows = [backpackItem({ id: 1, minerId: 1, hashRate: 10 }), backpackItem({ id: 2, minerId: 2, hashRate: 999 })];
    const groups = groupInventoryStacks(rows);
    expect(groups[0]!.minerId).toBe(2);
  });

  it('returns an empty array for no rows', () => {
    expect(groupInventoryStacks([])).toEqual([]);
  });

  it('treats an absent/falsy hashRate as 0 when sorting', () => {
    const rows = [backpackItem({ id: 1, minerId: 1, hashRate: undefined }), backpackItem({ id: 2, minerId: 2, hashRate: 5 })];
    const groups = groupInventoryStacks(rows);
    expect(groups[0]!.minerId).toBe(2);
  });

  it('treats a falsy hashRate as 0 regardless of comparator argument order', () => {
    const rows = [backpackItem({ id: 1, minerId: 1, hashRate: 5 }), backpackItem({ id: 2, minerId: 2, hashRate: undefined })];
    const groups = groupInventoryStacks(rows);
    expect(groups[0]!.minerId).toBe(1);
  });
});

describe('dedupeOccupiedSlotsForDismantle', () => {
  it('drops slots without a miner or a non-integer id', () => {
    const slots = [slot({ id: 1, miner: null }), slot({ id: NaN, miner: { id: 1 } as never })];
    expect(dedupeOccupiedSlotsForDismantle(slots)).toEqual([]);
  });

  it('deduplicates two slots that reference the same 2-slot machine (primary + blocked slot)', () => {
    const slots = [slot({ id: 1, miner: { id: 42, hashRate: 100 } }), slot({ id: 2, miner: { id: 42, hashRate: 100 } })];
    const out = dedupeOccupiedSlotsForDismantle(slots);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe(1);
  });

  it('keeps distinct machines', () => {
    const slots = [slot({ id: 1, miner: { id: 1, hashRate: 10 } }), slot({ id: 2, miner: { id: 2, hashRate: 20 } })];
    expect(dedupeOccupiedSlotsForDismantle(slots)).toHaveLength(2);
  });

  it('treats a null/undefined slots argument as an empty list rather than throwing', () => {
    expect(dedupeOccupiedSlotsForDismantle(undefined as unknown as UserRackSlot[])).toEqual([]);
  });
});

describe('formatHashrate', () => {
  it('formats 0/absent as "0 H/s"', () => {
    expect(formatHashrate(0)).toBe('0 H/s');
    expect(formatHashrate(undefined)).toBe('0 H/s');
    expect(formatHashrate(null)).toBe('0 H/s');
  });

  it('scales through units', () => {
    expect(formatHashrate(999)).toBe('999.0 H/s');
    expect(formatHashrate(1500)).toBe('1.50 KH/s');
    expect(formatHashrate(2_500_000)).toBe('2.50 MH/s');
  });

  it('does not crash on non-numeric input', () => {
    expect(formatHashrate('not-a-number')).toBe('0 H/s');
    expect(formatHashrate({ weird: true })).toBe('0 H/s');
  });
});

describe('resolveDisplayMachineImageSrc — XSS-adjacent URL allowlist', () => {
  it('allows a root-relative path', () => {
    expect(resolveDisplayMachineImageSrc('/media/miners/x.webp')).toBe('/media/miners/x.webp');
  });

  it('allows a real http(s) URL', () => {
    expect(resolveDisplayMachineImageSrc('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png');
  });

  it('blocks javascript:, data:, and vbscript: schemes', () => {
    expect(resolveDisplayMachineImageSrc('javascript:alert(1)')).toBeNull();
    expect(resolveDisplayMachineImageSrc('JAVASCRIPT:alert(1)')).toBeNull();
    expect(resolveDisplayMachineImageSrc('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(resolveDisplayMachineImageSrc('vbscript:msgbox(1)')).toBeNull();
  });

  it('blocks protocol-relative URLs (host-spoofing vector)', () => {
    expect(resolveDisplayMachineImageSrc('//evil.example.com/x.png')).toBeNull();
  });

  it('blocks non-http(s) schemes like file: and ftp:', () => {
    expect(resolveDisplayMachineImageSrc('file:///etc/passwd')).toBeNull();
    expect(resolveDisplayMachineImageSrc('ftp://example.com/x')).toBeNull();
  });

  it('returns null for empty, whitespace, non-string, or malformed input', () => {
    expect(resolveDisplayMachineImageSrc('')).toBeNull();
    expect(resolveDisplayMachineImageSrc('   ')).toBeNull();
    expect(resolveDisplayMachineImageSrc(undefined)).toBeNull();
    expect(resolveDisplayMachineImageSrc(null)).toBeNull();
    expect(resolveDisplayMachineImageSrc('not a url at all')).toBeNull();
  });

  it('blocks the stock brand-icon placeholder', () => {
    expect(resolveDisplayMachineImageSrc('/media/brand/icon.webp')).toBeNull();
    expect(resolveDisplayMachineImageSrc('/media/brand/icon.webp?v=2')).toBeNull();
  });
});

describe('resolveOwnedMachineImageUrl', () => {
  it('prefers a valid apiImageUrl/apiImageSource pair', () => {
    const result = resolveOwnedMachineImageUrl({ apiImageUrl: '/a.png', apiImageSource: 'catalog_current' });
    expect(result).toEqual({ imageUrl: '/a.png', imageSource: 'catalog_current' });
  });

  it('honors an explicit "none" apiImageSource instead of falling through to catalog/owned', () => {
    const result = resolveOwnedMachineImageUrl({
      apiImageUrl: '',
      apiImageSource: 'none',
      catalogImageUrl: '/catalog.png',
    });
    expect(result).toEqual({ imageUrl: null, imageSource: 'none' });
  });

  it('falls back to catalogImageUrl, then owned/row image, then none', () => {
    expect(resolveOwnedMachineImageUrl({ catalogImageUrl: '/catalog.png' })).toEqual({
      imageUrl: '/catalog.png',
      imageSource: 'catalog_current',
    });
    expect(resolveOwnedMachineImageUrl({ ownedMachineImageUrl: '/owned.png' })).toEqual({
      imageUrl: '/owned.png',
      imageSource: 'owned_snapshot',
    });
    expect(resolveOwnedMachineImageUrl({})).toEqual({ imageUrl: null, imageSource: 'none' });
  });

  it('skips the brand-icon placeholder at every tier', () => {
    expect(resolveOwnedMachineImageUrl({ catalogImageUrl: '/media/brand/icon.webp', ownedMachineImageUrl: '/real.png' })).toEqual({
      imageUrl: '/real.png',
      imageSource: 'owned_snapshot',
    });
  });
});

describe('apiErrorMessage', () => {
  it('returns the fallback for a non-axios error', () => {
    expect(apiErrorMessage(new Error('boom'), 'fallback')).toBe('fallback');
  });

  it('returns the fallback when the payload has no message field', () => {
    expect(apiErrorMessage({ response: { data: {} } }, 'fallback')).toBe('fallback');
  });

  function axiosErrorWith(data: unknown) {
    return new AxiosError('request failed', 'ERR', undefined, undefined, {
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as never,
      data,
    });
  }

  it('extracts the server message from a real AxiosError payload', () => {
    expect(apiErrorMessage(axiosErrorWith({ message: 'Slot already occupied.' }), 'fallback')).toBe('Slot already occupied.');
  });

  it('falls back when the AxiosError payload has no response at all', () => {
    expect(apiErrorMessage(new AxiosError('network error'), 'fallback')).toBe('fallback');
  });

  it('falls back when the AxiosError message field is empty or non-string', () => {
    expect(apiErrorMessage(axiosErrorWith({ message: '' }), 'fallback')).toBe('fallback');
    expect(apiErrorMessage(axiosErrorWith({ message: 123 }), 'fallback')).toBe('fallback');
  });
});

describe('getMachineDescriptor', () => {
  it('picks a tier by hashrate: >=1000 Quantum, >=500 Elite, >=100 Pro, >=50 Advanced, >=10 Standard, else Basic', () => {
    expect(getMachineDescriptor({ hashRate: 1000 }).name).toBe('Quantum Miner');
    expect(getMachineDescriptor({ hashRate: 1000 }).size).toBe(2);
    expect(getMachineDescriptor({ hashRate: 500 }).size).toBe(2);
    expect(getMachineDescriptor({ hashRate: 100 }).size).toBe(2);
    expect(getMachineDescriptor({ hashRate: 50 }).size).toBe(1);
    expect(getMachineDescriptor({ hashRate: 10 }).size).toBe(1);
    expect(getMachineDescriptor({ hashRate: 1 }).size).toBe(1);
  });

  it('uses an explicit minerName/miner_name/name over the computed tier label', () => {
    expect(getMachineDescriptor({ hashRate: 5, minerName: 'Custom' }).name).toBe('Custom');
    expect(getMachineDescriptor({ hashRate: 5, miner_name: 'Snake case' }).name).toBe('Snake case');
    expect(getMachineDescriptor({ hashRate: 5, name: 'Plain name' }).name).toBe('Plain name');
  });

  it('falls back to the computed tier label when no name field is present', () => {
    expect(getMachineDescriptor({ hashRate: 1000 }).name).toBe('Quantum Miner');
    expect(getMachineDescriptor({ hashRate: 1 }).name).toBe('Basic Miner');
  });

  it('respects an explicit integer slotSize/slot_size over the tier default', () => {
    expect(getMachineDescriptor({ hashRate: 1000, slotSize: 1 }).size).toBe(1);
    expect(getMachineDescriptor({ hashRate: 5, slot_size: 2 }).size).toBe(2);
  });

  it('reads hash_rate (snake_case) as a fallback for hashRate', () => {
    expect(getMachineDescriptor({ hash_rate: 1000 }).size).toBe(2);
  });

  it('resolves image from imageUrl or image_url, trimmed, or null when blank/absent', () => {
    expect(getMachineDescriptor({ hashRate: 1, imageUrl: '  /x.png  ' }).image).toBe('/x.png');
    expect(getMachineDescriptor({ hashRate: 1, image_url: '/y.png' }).image).toBe('/y.png');
    expect(getMachineDescriptor({ hashRate: 1, imageUrl: '   ' }).image).toBeNull();
    expect(getMachineDescriptor({ hashRate: 1 }).image).toBeNull();
  });

  it('handles null/undefined row without throwing', () => {
    expect(getMachineDescriptor(null)).toEqual({ name: 'Basic Miner', image: null, size: 1 });
    expect(getMachineDescriptor(undefined)).toEqual({ name: 'Basic Miner', image: null, size: 1 });
  });
});

describe('parsePositiveIntFromDrag', () => {
  it('parses a positive integer string', () => {
    expect(parsePositiveIntFromDrag('5')).toBe(5);
  });

  it('returns null for null/undefined/empty', () => {
    expect(parsePositiveIntFromDrag(null)).toBeNull();
    expect(parsePositiveIntFromDrag(undefined)).toBeNull();
    expect(parsePositiveIntFromDrag('')).toBeNull();
  });

  it('returns null for zero, negative, or non-numeric values', () => {
    expect(parsePositiveIntFromDrag('0')).toBeNull();
    expect(parsePositiveIntFromDrag('-3')).toBeNull();
    expect(parsePositiveIntFromDrag('abc')).toBeNull();
  });
});

describe('safeDisplayLabel', () => {
  it('strips control characters', () => {
    expect(safeDisplayLabel('abc def')).toBe('abcdef');
  });

  it('truncates long values with an ellipsis', () => {
    const long = 'x'.repeat(300);
    const out = safeDisplayLabel(long, 10);
    expect(out).toBe(`${'x'.repeat(10)}…`);
  });

  it('returns empty string for null/undefined', () => {
    expect(safeDisplayLabel(null)).toBe('');
    expect(safeDisplayLabel(undefined)).toBe('');
  });
});
