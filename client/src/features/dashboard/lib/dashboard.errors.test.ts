import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fingerprintDashboardError, logDashboardError } from './dashboard.errors';

describe('logDashboardError', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a non-empty correlation id', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = logDashboardError('DASHBOARD_CYCLE_FETCH_FAILED', new Error('boom'));
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns a different correlation id on each call (no collision across concurrent errors)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = logDashboardError('DASHBOARD_BALANCE_FETCH_FAILED', new Error('a'));
    const b = logDashboardError('DASHBOARD_BALANCE_FETCH_FAILED', new Error('b'));
    expect(a).not.toBe(b);
  });

  it('logs the axios response status when present', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logDashboardError('DASHBOARD_SLOTS_FETCH_FAILED', { response: { status: 503 } });
    const payload = spy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.status).toBe(503);
    expect(payload.code).toBe('DASHBOARD_SLOTS_FETCH_FAILED');
  });

  it('handles a non-Error, non-axios thrown value without crashing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => logDashboardError('DASHBOARD_FEE_INFO_FETCH_FAILED', 'plain string error')).not.toThrow();
    expect(() => logDashboardError('DASHBOARD_FEE_INFO_FETCH_FAILED', undefined)).not.toThrow();
    expect(() => logDashboardError('DASHBOARD_FEE_INFO_FETCH_FAILED', { weird: 'shape' })).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('never logs response body/header data (only status + message) to avoid leaking tokens/PII', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logDashboardError('DASHBOARD_REFERRAL_LINK_FAILED', {
      response: { status: 400, data: { token: 'secret-jwt', password: 'hunter2' } },
    });
    const payload = spy.mock.calls[0]?.[1] as Record<string, unknown>;
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('secret-jwt');
    expect(serialized).not.toContain('hunter2');
  });

  it('groups repeats of the same failure under one fingerprint regardless of correlation/error id', () => {
    const fpA = fingerprintDashboardError('DASHBOARD_SLOTS_FETCH_FAILED', { response: { status: 503 } });
    const fpB = fingerprintDashboardError('DASHBOARD_SLOTS_FETCH_FAILED', { response: { status: 503 } });
    expect(fpA).toBe(fpB);
  });

  it('separates fingerprints by HTTP status so a 500 spike is not conflated with a 404 spike', () => {
    const fp500 = fingerprintDashboardError('DASHBOARD_SLOTS_FETCH_FAILED', { response: { status: 500 } });
    const fp404 = fingerprintDashboardError('DASHBOARD_SLOTS_FETCH_FAILED', { response: { status: 404 } });
    expect(fp500).not.toBe(fp404);
  });

  it('attaches errorId, correlationId and fingerprint as distinct values on the same log entry', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorId = logDashboardError('DASHBOARD_BANNERS_FETCH_FAILED', new Error('down'));
    const payload = spy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.errorId).toBe(errorId);
    expect(payload.correlationId).not.toBe(errorId);
    expect(payload.fingerprint).toBe('dashboard:DASHBOARD_BANNERS_FETCH_FAILED:network');
  });

  it('rates money-affecting write failures as CRITICAL/HIGH impact and read-only fetch failures as ERROR/LOW impact', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logDashboardError('DASHBOARD_ALLOCATION_SAVE_FAILED', new Error('boom'));
    logDashboardError('DASHBOARD_ENERGY_TAX_PAY_FAILED', new Error('boom'));
    logDashboardError('DASHBOARD_CYCLE_FETCH_FAILED', new Error('boom'));
    const [allocation, energyTax, cycle] = spy.mock.calls.map((c) => c[1] as Record<string, unknown>);
    expect(allocation.severity).toBe('CRITICAL');
    expect(allocation.impact).toBe('HIGH');
    expect(energyTax.severity).toBe('CRITICAL');
    expect(energyTax.impact).toBe('HIGH');
    expect(cycle.severity).toBe('ERROR');
    expect(cycle.impact).toBe('LOW');
  });
});
