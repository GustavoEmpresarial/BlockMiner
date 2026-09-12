import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  readDashboardBalanceCurrency,
  writeDashboardBalanceCurrency,
  emptyDashboardWalletBalances,
} from './dashboardBalanceCurrency';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('readDashboardBalanceCurrency', () => {
  it('defaults to POL when nothing was stored', () => {
    expect(readDashboardBalanceCurrency(1)).toBe('POL');
  });

  it('returns the previously written currency for that user', () => {
    writeDashboardBalanceCurrency(7, 'SHIB');
    expect(readDashboardBalanceCurrency(7)).toBe('SHIB');
  });

  it('scopes storage per user id — one user cannot read another user’s preference', () => {
    writeDashboardBalanceCurrency(1, 'BLK');
    expect(readDashboardBalanceCurrency(2)).toBe('POL');
  });

  it('falls back to POL on a corrupted/invalid stored value instead of throwing', () => {
    localStorage.setItem('bm.dashboard.balanceCurrency:5', 'NOT_A_CURRENCY');
    expect(readDashboardBalanceCurrency(5)).toBe('POL');
  });

  it('falls back to POL when localStorage.getItem throws (private-browsing / quota)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(readDashboardBalanceCurrency(1)).toBe('POL');
  });

  it('uses the "anon" bucket for an undefined user id without throwing', () => {
    expect(readDashboardBalanceCurrency(undefined)).toBe('POL');
  });
});

describe('writeDashboardBalanceCurrency', () => {
  it('does not throw when localStorage.setItem throws (quota exceeded)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeDashboardBalanceCurrency(1, 'BLK')).not.toThrow();
  });
});

describe('emptyDashboardWalletBalances', () => {
  it('returns all-zero balances', () => {
    expect(emptyDashboardWalletBalances()).toEqual({ POL: 0, SHIB: 0, BLK: 0 });
  });
});
