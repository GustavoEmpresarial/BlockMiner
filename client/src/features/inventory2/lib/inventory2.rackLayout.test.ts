import { describe, expect, it } from 'vitest';
import {
  computeSlotOverlayStyle,
  parseVisualFanDrag,
  parseVisualFanFromDrag,
  RACK_SLOT_COLUMNS,
  RACK_SLOT_RECTS,
  RACK_SLOT_ROWS,
} from './inventory2.rackLayout';

function dataTransferWith(entries: Record<string, string>): DataTransfer {
  return {
    getData: (key: string) => entries[key] ?? '',
  } as unknown as DataTransfer;
}

describe('RACK_SLOT_RECTS', () => {
  it('builds exactly COLUMNS * ROWS rects', () => {
    expect(RACK_SLOT_RECTS).toHaveLength(RACK_SLOT_COLUMNS * RACK_SLOT_ROWS);
  });

  it('every rect has positive width/height and lies within the 0-100% frame', () => {
    for (const rect of RACK_SLOT_RECTS) {
      expect(rect.wPct).toBeGreaterThan(0);
      expect(rect.hPct).toBeGreaterThan(0);
      expect(rect.xPct).toBeGreaterThanOrEqual(0);
      expect(rect.yPct).toBeGreaterThanOrEqual(0);
      expect(rect.xPct + rect.wPct).toBeLessThanOrEqual(100.01);
    }
  });
});

describe('computeSlotOverlayStyle', () => {
  it('returns null for an out-of-range slot index', () => {
    expect(computeSlotOverlayStyle(999, 1)).toBeNull();
  });

  it('returns the plain rect for a 1-slot machine', () => {
    const style = computeSlotOverlayStyle(0, 1);
    const rect = RACK_SLOT_RECTS[0]!;
    expect(style).toEqual({
      left: `${rect.xPct}%`,
      top: `${rect.yPct}%`,
      width: `${rect.wPct}%`,
      height: `${rect.hPct}%`,
    });
  });

  it('merges with the next bay on the same row for a 2-slot machine', () => {
    const style = computeSlotOverlayStyle(0, 2);
    const primary = RACK_SLOT_RECTS[0]!;
    const next = RACK_SLOT_RECTS[1]!;
    expect(style!.left).toBe(`${primary.xPct}%`);
    expect(style!.width).toBe(`${next.xPct + next.wPct - primary.xPct}%`);
  });

  it('falls back to the single-slot rect at the last column of a row (no next-slot merge across rows)', () => {
    const lastColIndex = RACK_SLOT_COLUMNS - 1;
    const style = computeSlotOverlayStyle(lastColIndex, 2);
    const rect = RACK_SLOT_RECTS[lastColIndex]!;
    expect(style).toEqual({
      left: `${rect.xPct}%`,
      top: `${rect.yPct}%`,
      width: `${rect.wPct}%`,
      height: `${rect.hPct}%`,
    });
  });

  it('treats a fractional/invalid slotSize as 1', () => {
    const style = computeSlotOverlayStyle(0, 0.4);
    const rect = RACK_SLOT_RECTS[0]!;
    expect(style).toEqual({
      left: `${rect.xPct}%`,
      top: `${rect.yPct}%`,
      width: `${rect.wPct}%`,
      height: `${rect.hPct}%`,
    });
  });
});

describe('parseVisualFanDrag', () => {
  it('returns true only when the marker value is exactly "1"', () => {
    expect(parseVisualFanDrag(dataTransferWith({ visualFan: '1' }))).toBe(true);
    expect(parseVisualFanDrag(dataTransferWith({ visualFan: '2' }))).toBe(false);
    expect(parseVisualFanDrag(dataTransferWith({}))).toBe(false);
  });
});

describe('parseVisualFanFromDrag', () => {
  it('parses a valid non-negative integer', () => {
    expect(parseVisualFanFromDrag(dataTransferWith({ visualFanFrom: '5' }))).toBe(5);
    expect(parseVisualFanFromDrag(dataTransferWith({ visualFanFrom: '0' }))).toBe(0);
  });

  it('returns null for missing, empty, negative, or non-numeric values', () => {
    expect(parseVisualFanFromDrag(dataTransferWith({}))).toBeNull();
    expect(parseVisualFanFromDrag(dataTransferWith({ visualFanFrom: '' }))).toBeNull();
    expect(parseVisualFanFromDrag(dataTransferWith({ visualFanFrom: '-1' }))).toBeNull();
    expect(parseVisualFanFromDrag(dataTransferWith({ visualFanFrom: 'abc' }))).toBeNull();
  });
});
