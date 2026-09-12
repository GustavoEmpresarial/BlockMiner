import { describe, expect, it } from 'vitest';
import { formatHashrate, utcDateKey, formatUtcChartDay, formatUtcDayStartLabel, formatPol } from './format';

describe('formatHashrate', () => {
  it('returns "0 H/s" for zero, negative-canceling, and non-finite input', () => {
    expect(formatHashrate(0)).toBe('0 H/s');
    expect(formatHashrate(undefined)).toBe('0 H/s');
    expect(formatHashrate(null)).toBe('0 H/s');
    expect(formatHashrate('not-a-number')).toBe('0 H/s');
    expect(formatHashrate(NaN)).toBe('0 H/s');
    expect(formatHashrate(Infinity)).toBe('0 H/s');
  });

  it('keeps small values in H/s with 2 decimals', () => {
    expect(formatHashrate(42)).toBe('42.00 H/s');
  });

  it('scales up through KH/s, MH/s, GH/s, TH/s, PH/s', () => {
    expect(formatHashrate(1_000)).toBe('1.00 KH/s');
    expect(formatHashrate(1_000_000)).toBe('1.00 MH/s');
    expect(formatHashrate(1_000_000_000)).toBe('1.00 GH/s');
    expect(formatHashrate(1_000_000_000_000)).toBe('1.00 TH/s');
    expect(formatHashrate(1_000_000_000_000_000)).toBe('1.00 PH/s');
  });

  it('stops scaling at PH/s (the largest unit) instead of throwing on an undefined unit', () => {
    expect(formatHashrate(1_000_000_000_000_000_000)).toBe('1000.0 PH/s');
  });

  it('uses 1 decimal once the scaled value reaches 100', () => {
    expect(formatHashrate(150_000)).toBe('150.0 KH/s');
  });

  it('coerces a numeric string', () => {
    expect(formatHashrate('2000')).toBe('2.00 KH/s');
  });
});

describe('utcDateKey', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(utcDateKey(new Date('2026-03-05T23:59:59Z'))).toBe('2026-03-05');
  });
});

describe('formatUtcChartDay', () => {
  it('formats a date key with the Portuguese month abbreviation', () => {
    expect(formatUtcChartDay('2026-03-05')).toBe('05 Mar UTC');
  });

  it('covers every month abbreviation without falling out of bounds', () => {
    for (let m = 1; m <= 12; m += 1) {
      const key = `2026-${String(m).padStart(2, '0')}-01`;
      expect(formatUtcChartDay(key)).not.toContain('undefined');
    }
  });

  it('falls back to embedding the raw date key when the month is out of range', () => {
    expect(formatUtcChartDay('2026-13-01')).toBe('01 2026-13-01 UTC');
  });
});

describe('formatUtcDayStartLabel', () => {
  it('appends the UTC midnight suffix', () => {
    expect(formatUtcDayStartLabel('2026-03-05')).toBe('2026-03-05 00:00:00 UTC');
  });
});

describe('formatPol', () => {
  it('returns "0" for non-finite input instead of "NaN"', () => {
    expect(formatPol(NaN)).toBe('0');
    expect(formatPol(Infinity)).toBe('0');
  });

  it('uses up to 8 decimals for small amounts', () => {
    expect(formatPol(0.00000001)).toBe('0.00000001');
  });

  it('uses at most 2 decimals once the amount reaches 100', () => {
    expect(formatPol(150.123456)).toBe('150.12');
  });

  it('respects a locale override', () => {
    expect(formatPol(1234, 'pt-BR')).toContain('1');
  });
});
