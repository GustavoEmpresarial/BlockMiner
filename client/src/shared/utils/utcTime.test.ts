import { describe, expect, it } from 'vitest';
import {
  addUtcDays,
  formatUtcDate,
  formatUtcDateTime,
  formatUtcTime,
  fromUtcInputValue,
  isSameUtcDay,
  startOfUtcDay,
  toUtcInputValue,
} from './utcTime';

// 23:30 UTC — a local-time formatter in any UTC- or UTC+ zone would shift the day/hour.
const ISO = '2026-03-04T23:30:00.000Z';

describe('formatUtcDateTime', () => {
  it('formats in UTC and appends the UTC suffix', () => {
    expect(formatUtcDateTime(ISO, { locale: 'pt-BR' })).toBe('04/03/2026, 23:30 UTC');
  });

  it('accepts Date and epoch ms', () => {
    expect(formatUtcDateTime(new Date(ISO), { locale: 'pt-BR' })).toBe('04/03/2026, 23:30 UTC');
    expect(formatUtcDateTime(Date.parse(ISO), { locale: 'pt-BR' })).toBe('04/03/2026, 23:30 UTC');
  });

  it('honours explicit Intl options instead of the defaults', () => {
    expect(formatUtcDateTime(ISO, { locale: 'pt-BR', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))
      .toBe('04/03, 23:30 UTC');
  });

  it('returns fallback for null/undefined/invalid', () => {
    expect(formatUtcDateTime(null)).toBe('—');
    expect(formatUtcDateTime(undefined, { fallback: '' })).toBe('');
    expect(formatUtcDateTime('not a date', { fallback: '--' })).toBe('--');
  });

  it('adds seconds while keeping default shape', () => {
    expect(formatUtcDateTime(ISO, { locale: 'pt-BR', seconds: true })).toBe('04/03/2026, 23:30:00 UTC');
  });

  it('can hide the suffix', () => {
    expect(formatUtcDateTime(ISO, { locale: 'pt-BR', showUtc: false })).toBe('04/03/2026, 23:30');
  });
});

describe('formatUtcDate', () => {
  it('formats date-only in UTC without suffix', () => {
    expect(formatUtcDate(ISO, { locale: 'pt-BR' })).toBe('04/03/2026');
    expect(formatUtcDate(ISO, { locale: 'en-US' })).toBe('03/04/2026');
  });
});

describe('formatUtcTime', () => {
  it('formats time-of-day in UTC with suffix', () => {
    expect(formatUtcTime(ISO, { locale: 'pt-BR' })).toBe('23:30 UTC');
  });
});

describe('UTC day helpers', () => {
  it('startOfUtcDay / addUtcDays / isSameUtcDay', () => {
    expect(new Date(startOfUtcDay(ISO)).toISOString()).toBe('2026-03-04T00:00:00.000Z');
    expect(addUtcDays(-6, ISO).toISOString()).toBe('2026-02-26T00:00:00.000Z');
    expect(isSameUtcDay(ISO, '2026-03-04T00:00:00Z')).toBe(true);
    expect(isSameUtcDay(ISO, '2026-03-05T00:00:00Z')).toBe(false);
    expect(isSameUtcDay(null, ISO)).toBe(false);
  });
});

describe('datetime-local UTC converters', () => {
  it('round-trips through UTC', () => {
    expect(toUtcInputValue(ISO)).toBe('2026-03-04T23:30');
    expect(fromUtcInputValue('2026-03-04T23:30')).toBe('2026-03-04T23:30:00.000Z');
    expect(fromUtcInputValue(toUtcInputValue(ISO))).toBe(ISO);
  });

  it('handles empty/invalid', () => {
    expect(toUtcInputValue(null)).toBe('');
    expect(toUtcInputValue('garbage')).toBe('');
    expect(fromUtcInputValue('')).toBeNull();
    expect(fromUtcInputValue(undefined)).toBeNull();
    expect(fromUtcInputValue('nope')).toBeNull();
  });
});
