import { describe, expect, it, vi, afterEach } from 'vitest';
import { AxiosError } from 'axios';
import { fingerprintVaultError, logVaultError } from './vault.errors';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logVaultError', () => {
  it('logs a structured entry with a stable code, unique ids, fingerprint, and message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorId = logVaultError('VAULT_RETRIEVE_FAILED', new Error('boom'));
    expect(spy).toHaveBeenCalledTimes(1);
    const [, entry] = spy.mock.calls[0]!;
    expect(entry).toMatchObject({
      code: 'VAULT_RETRIEVE_FAILED',
      severity: 'CRITICAL',
      impact: 'MEDIUM',
      source: 'vault',
      message: 'boom',
    });
    expect(entry.errorId).toBe(errorId);
    expect(errorId).toMatch(/^err_/);
    expect(entry.correlationId).toMatch(/^corr_/);
  });

  it('two calls for the same code/error produce different error/correlation ids (never reused)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const id1 = logVaultError('VAULT_RETRIEVE_FAILED', new Error('boom'));
    const id2 = logVaultError('VAULT_RETRIEVE_FAILED', new Error('boom'));
    expect(id1).not.toBe(id2);
  });

  it('scores the read-only list fetch as ERROR/LOW, and the retrieve mutation as CRITICAL/MEDIUM', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logVaultError('VAULT_LIST_FETCH_FAILED', new Error('x'));
    logVaultError('VAULT_RETRIEVE_FAILED', new Error('x'));
    const [, fetchEntry] = spy.mock.calls[0]!;
    const [, retrieveEntry] = spy.mock.calls[1]!;
    expect(fetchEntry).toMatchObject({ severity: 'ERROR', impact: 'LOW' });
    expect(retrieveEntry).toMatchObject({ severity: 'CRITICAL', impact: 'MEDIUM' });
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
    logVaultError('VAULT_RETRIEVE_FAILED', err);
    const [, entry] = spy.mock.calls[0]!;
    expect(entry.status).toBe(409);
  });

  it('falls back to "network" in the fingerprint when there is no HTTP status', () => {
    expect(fingerprintVaultError('VAULT_RETRIEVE_FAILED', new Error('x'))).toBe('vault:VAULT_RETRIEVE_FAILED:network');
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
    expect(fingerprintVaultError('VAULT_RETRIEVE_FAILED', err400)).toBe('vault:VAULT_RETRIEVE_FAILED:400');
    expect(fingerprintVaultError('VAULT_RETRIEVE_FAILED', err500)).toBe('vault:VAULT_RETRIEVE_FAILED:500');
  });

  it('handles a string thrown value and an unknown/non-Error value without throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logVaultError('VAULT_RETRIEVE_FAILED', 'plain string error');
    expect(spy.mock.calls[0]![1]).toMatchObject({ message: 'plain string error' });

    logVaultError('VAULT_RETRIEVE_FAILED', { weird: true });
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
    logVaultError('VAULT_RETRIEVE_FAILED', err);
    const [, entry] = spy.mock.calls[0]!;
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('secret-token');
  });
});
