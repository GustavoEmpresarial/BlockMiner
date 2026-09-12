import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fingerprintStatsError, logStatsError } from './stats.errors';

describe('logStatsError', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a non-empty errorId', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = logStatsError('STATS_POWER_FETCH_FAILED', new Error('boom'));
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns a different errorId on each call', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = logStatsError('STATS_EARNINGS_FETCH_FAILED', new Error('a'));
    const b = logStatsError('STATS_EARNINGS_FETCH_FAILED', new Error('b'));
    expect(a).not.toBe(b);
  });

  it('logs the axios response status when present', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logStatsError('STATS_POWER_FETCH_FAILED', { response: { status: 503 } });
    const payload = spy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.status).toBe(503);
    expect(payload.code).toBe('STATS_POWER_FETCH_FAILED');
  });

  it('handles a non-Error, non-axios thrown value without crashing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => logStatsError('STATS_EARNINGS_FETCH_FAILED', 'plain string error')).not.toThrow();
    expect(() => logStatsError('STATS_EARNINGS_FETCH_FAILED', undefined)).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('never logs response body/header data (only status + message)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logStatsError('STATS_POWER_FETCH_FAILED', {
      response: { status: 400, data: { token: 'secret-jwt', password: 'hunter2' } },
    });
    const serialized = JSON.stringify(spy.mock.calls[0]?.[1]);
    expect(serialized).not.toContain('secret-jwt');
    expect(serialized).not.toContain('hunter2');
  });

  it('rates the payout-mode-switch failure as CRITICAL/MEDIUM and read fetch failures as ERROR/LOW', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logStatsError('STATS_PAYOUT_MODE_SWITCH_FAILED', new Error('x'));
    logStatsError('STATS_POWER_FETCH_FAILED', new Error('x'));
    const [payout, power] = spy.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(payout.severity).toBe('CRITICAL');
    expect(payout.impact).toBe('MEDIUM');
    expect(power.severity).toBe('ERROR');
    expect(power.impact).toBe('LOW');
  });

  it('fingerprints group repeats of the same failure and separate by status', () => {
    const fpA = fingerprintStatsError('STATS_POWER_FETCH_FAILED', { response: { status: 500 } });
    const fpB = fingerprintStatsError('STATS_POWER_FETCH_FAILED', { response: { status: 500 } });
    const fpC = fingerprintStatsError('STATS_POWER_FETCH_FAILED', { response: { status: 404 } });
    expect(fpA).toBe(fpB);
    expect(fpA).not.toBe(fpC);
  });

  it('falls back to a Date.now()+random id when crypto.randomUUID is unavailable', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('crypto', undefined);
    try {
      const id = logStatsError('STATS_POWER_FETCH_FAILED', new Error('x'));
      expect(id).toMatch(/^err_\d+-[a-z0-9]+$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
