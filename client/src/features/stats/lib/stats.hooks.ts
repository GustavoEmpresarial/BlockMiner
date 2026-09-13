import { useCallback, useEffect, useRef, useState } from 'react';
import {
  readAxiosHttpStatus,
  readAxiosResponseMessage,
  shouldStopApiPolling,
} from '../../checkin/lib/httpPollingGuard';
import type { EarningsUiFilter } from './stats.config';
import { fetchPowerStatsEnvelope, type UserPowerStatsPayload } from './stats.api';
import { fetchUserEarningsStats, type UserEarningsPayload } from './stats.earnings.api';
import { logStatsError } from './stats.errors';

const DEFAULT_POWER_POLL_MS = 45_000;
const MIN_POLL_MS = 5_000;

/**
 * Consolidated power statistics (read-only). Polls periodically for expiry accuracy.
 * Stops polling after 401/500/503 until manual refetch.
 */
export function useUserPowerStats(pollMs: number = DEFAULT_POWER_POLL_MS) {
  const [data, setData] = useState<UserPowerStatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollingEnabledRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetchPowerStatsEnvelope();
      if (res?.ok) {
        setData(res);
        setError(null);
        pollingEnabledRef.current = true;
      } else {
        logStatsError('STATS_POWER_FETCH_FAILED', res);
        setError(res?.message || 'Failed to load power statistics');
        pollingEnabledRef.current = false;
      }
    } catch (e: unknown) {
      logStatsError('STATS_POWER_FETCH_FAILED', e);
      const status = readAxiosHttpStatus(e);
      if (shouldStopApiPolling(status)) {
        pollingEnabledRef.current = false;
      }
      setError(readAxiosResponseMessage(e, 'Failed to load power statistics'));
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    pollingEnabledRef.current = true;
    setLoading(true);
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!pollMs || pollMs < MIN_POLL_MS) return undefined;
    const id = setInterval(() => {
      if (!pollingEnabledRef.current) return;
      void fetchData();
    }, pollMs);
    return () => clearInterval(id);
  }, [fetchData, pollMs]);

  return { data, loading, error, refetch };
}

/**
 * POL earnings for the selected dashboard period. Refetches when the filter changes.
 */
export function useUserEarningsStats(filter: EarningsUiFilter) {
  const [data, setData] = useState<UserEarningsPayload | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchUserEarningsStats(filter);
      if (res.ok) {
        setData(res);
        setError(null);
      } else {
        logStatsError('STATS_EARNINGS_FETCH_FAILED', res);
        setError(res.message || 'Failed to load earnings');
      }
    } catch (e: unknown) {
      logStatsError('STATS_EARNINGS_FETCH_FAILED', e);
      setError(readAxiosResponseMessage(e, 'Failed to load earnings'));
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch };
}
