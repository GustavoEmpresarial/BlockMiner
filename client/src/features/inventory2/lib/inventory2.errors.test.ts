import { describe, expect, it, vi, afterEach } from 'vitest';
import { AxiosError } from 'axios';
import { fingerprintInventory2Error, logInventory2Error } from './inventory2.errors';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logInventory2Error', () => {
  it('logs a structured entry with a stable code, unique ids, fingerprint, and message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorId = logInventory2Error('INVENTORY_INSTALL_FAILED', new Error('boom'));
    expect(spy).toHaveBeenCalledTimes(1);
    const [, entry] = spy.mock.calls[0]!;
    expect(entry).toMatchObject({
      code: 'INVENTORY_INSTALL_FAILED',
      severity: 'CRITICAL',
      impact: 'MEDIUM',
      source: 'inventory2',
      message: 'boom',
    });
    expect(entry.errorId).toBe(errorId);
    expect(errorId).toMatch(/^err_/);
    expect(entry.correlationId).toMatch(/^corr_/);
  });

  it('two calls for the same code/error produce different error/correlation ids (never reused)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const id1 = logInventory2Error('INVENTORY_INSTALL_FAILED', new Error('boom'));
    const id2 = logInventory2Error('INVENTORY_INSTALL_FAILED', new Error('boom'));
    expect(id1).not.toBe(id2);
  });

  it('scores read-only fetch failures as ERROR/LOW, and asset/currency-moving failures as CRITICAL/MEDIUM', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logInventory2Error('INVENTORY_ROOMS_FETCH_FAILED', new Error('x'));
    logInventory2Error('INVENTORY_BUY_ROOM_FAILED', new Error('x'));
    const [, fetchEntry] = spy.mock.calls[0]!;
    const [, buyEntry] = spy.mock.calls[1]!;
    expect(fetchEntry).toMatchObject({ severity: 'ERROR', impact: 'LOW' });
    expect(buyEntry).toMatchObject({ severity: 'CRITICAL', impact: 'MEDIUM' });
  });

  it('extracts the HTTP status from an AxiosError response', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new AxiosError('bad', 'ERR', undefined, undefined, {
      status: 409,
      statusText: 'Conflict',
      headers: {},
      config: {} as never,
      data: {},
    });
    logInventory2Error('INVENTORY_MOVE_RACK_TO_VAULT_FAILED', err);
    const [, entry] = spy.mock.calls[0]!;
    expect(entry.status).toBe(409);
  });

  it('falls back to "network" in the fingerprint when there is no HTTP status', () => {
    expect(fingerprintInventory2Error('INVENTORY_INSTALL_FAILED', new Error('x'))).toBe(
      'inventory2:INVENTORY_INSTALL_FAILED:network',
    );
  });

  it('the fingerprint includes the real status when present, so distinct statuses group separately', () => {
    const err400 = new AxiosError('x', 'ERR', undefined, undefined, {
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config: {} as never,
      data: {},
    });
    const err500 = new AxiosError('x', 'ERR', undefined, undefined, {
      status: 500,
      statusText: 'Server Error',
      headers: {},
      config: {} as never,
      data: {},
    });
    expect(fingerprintInventory2Error('INVENTORY_INSTALL_FAILED', err400)).toBe('inventory2:INVENTORY_INSTALL_FAILED:400');
    expect(fingerprintInventory2Error('INVENTORY_INSTALL_FAILED', err500)).toBe('inventory2:INVENTORY_INSTALL_FAILED:500');
  });

  it('handles a string thrown value and an unknown/non-Error value without throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logInventory2Error('INVENTORY_INSTALL_FAILED', 'plain string error');
    expect(spy.mock.calls[0]![1]).toMatchObject({ message: 'plain string error' });

    logInventory2Error('INVENTORY_INSTALL_FAILED', { weird: true });
    expect(spy.mock.calls[1]![1]).toMatchObject({ message: 'unknown_error' });
  });

  it('never logs the raw error object, response body, or headers — only status + message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new AxiosError('bad', 'ERR', undefined, undefined, {
      status: 400,
      statusText: 'Bad Request',
      headers: { authorization: 'Bearer secret-token' },
      config: {} as never,
      data: { password: 'hunter2', message: 'Invalid input' },
    });
    logInventory2Error('INVENTORY_INSTALL_FAILED', err);
    const [, entry] = spy.mock.calls[0]!;
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('secret-token');
  });
});
