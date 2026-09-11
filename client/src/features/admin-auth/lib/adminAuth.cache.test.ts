import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  checkAdminAuthThrottled,
  clearAdminAuthCache,
  getAdminAuthCache,
  setAdminAuthCache,
  __adminAuthCacheTestState,
} from './adminAuth.cache';

describe('adminAuth.cache', () => {
  beforeEach(() => {
    clearAdminAuthCache();
  });

  it('setAdminAuthCache makes getAdminAuthCache fresh', () => {
    setAdminAuthCache(true);
    expect(getAdminAuthCache()).toEqual({ value: true, fresh: true });
  });

  it('clearAdminAuthCache drops stale false so login can remount layout cleanly', () => {
    setAdminAuthCache(false);
    clearAdminAuthCache();
    expect(getAdminAuthCache()).toEqual({ value: null, fresh: false });
    expect(__adminAuthCacheTestState().value).toBeNull();
  });

  it('checkAdminAuthThrottled reuses cached value within throttle window', async () => {
    const fetcher = vi.fn(async () => true);
    await expect(checkAdminAuthThrottled(fetcher)).resolves.toBe(true);
    await expect(checkAdminAuthThrottled(fetcher)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('after login sets true, throttle returns true without refetch', async () => {
    setAdminAuthCache(false);
    clearAdminAuthCache();
    setAdminAuthCache(true);
    const fetcher = vi.fn(async () => false);
    await expect(checkAdminAuthThrottled(fetcher)).resolves.toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
