import { describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { resolveApiErrorMessage, resolveApiPayloadMessage } from './apiErrorI18n';

describe('resolveApiPayloadMessage', () => {
  it('matches every real call site in this codebase: (data, fallbackString) with no `t` — must not throw', () => {
    // Regression test for a real bug: this used to require (data, t, fallbackKey),
    // but every actual caller (Inventory2Page.tsx, SettingsPage.tsx) called it as
    // (data, t('some.key')) — passing an already-resolved STRING as the `t` slot and
    // omitting the fallback entirely. That threw `TypeError: t is not a function`
    // the instant a payload carried a `messageKey` field.
    expect(() => resolveApiPayloadMessage({ messageKey: 'inventory.errors.slot_taken' }, 'Erro')).not.toThrow();
  });

  it('prefers data.message when present', () => {
    expect(resolveApiPayloadMessage({ message: 'Slot already occupied.' }, 'fallback')).toBe('Slot already occupied.');
  });

  it('falls back to the given string when message is absent/blank', () => {
    expect(resolveApiPayloadMessage({}, 'fallback')).toBe('fallback');
    expect(resolveApiPayloadMessage({ message: '   ' }, 'fallback')).toBe('fallback');
    expect(resolveApiPayloadMessage(null, 'fallback')).toBe('fallback');
    expect(resolveApiPayloadMessage('not an object', 'fallback')).toBe('fallback');
  });

  it('trims a whitespace-padded message', () => {
    expect(resolveApiPayloadMessage({ message: '  hi  ' }, 'fallback')).toBe('hi');
  });

  it('when a t function is given, resolves messageKey through it if translated', () => {
    const t = vi.fn((key: string) => (key === 'inventory.errors.slot_taken' ? 'Slot taken' : key));
    expect(resolveApiPayloadMessage({ messageKey: 'inventory.errors.slot_taken' }, 'fallback', t)).toBe('Slot taken');
  });

  it('falls back when t is given but the messageKey does not translate to anything new', () => {
    const t = vi.fn((key: string) => key);
    expect(resolveApiPayloadMessage({ messageKey: 'unknown.key' }, 'fallback', t)).toBe('fallback');
  });

  it('resolves via errors.<code> when no message/messageKey translates, given t', () => {
    const t = vi.fn((key: string) => (key === 'errors.RACK_OCCUPIED' ? 'Rack occupied' : key));
    expect(resolveApiPayloadMessage({ code: 'RACK_OCCUPIED' }, 'fallback', t)).toBe('Rack occupied');
  });

  it('ignores messageKey/code entirely when t is not provided (matches every real caller)', () => {
    expect(resolveApiPayloadMessage({ messageKey: 'x', code: 'Y' }, 'fallback')).toBe('fallback');
  });
});

describe('resolveApiErrorMessage', () => {
  it('prefers the axios response payload message', () => {
    const err = new AxiosError('boom', 'ERR', undefined, undefined, {
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as never,
      data: { message: 'Server says no.' },
    });
    expect(resolveApiErrorMessage(err, 'fallback')).toBe('Server says no.');
  });

  it('falls back to the axios error message when there is no payload message', () => {
    const err = new AxiosError('network failed');
    expect(resolveApiErrorMessage(err, 'fallback')).toBe('network failed');
  });

  it('falls back to a plain Error message for a non-axios error', () => {
    expect(resolveApiErrorMessage(new Error('plain error'), 'fallback')).toBe('plain error');
  });

  it('falls back to the given string for a totally unknown throwable', () => {
    expect(resolveApiErrorMessage('a string was thrown', 'fallback')).toBe('fallback');
    expect(resolveApiErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});
