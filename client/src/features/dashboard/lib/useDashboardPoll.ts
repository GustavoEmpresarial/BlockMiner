import { useEffect } from 'react';

/**
 * Runs `fetcher` immediately, then on a fixed interval, and again whenever the
 * tab regains focus/visibility. Extracted from DashboardPage.tsx, which had
 * this exact effect duplicated for the mining-cycle poll and the wallet-balance
 * poll (same interval id, same visibilitychange/focus listeners, same cleanup —
 * only the async call inside differed).
 *
 * `fetcher` must not throw for expected failures — it fully owns its own
 * try/catch/error-logging so a rejected poll never surfaces as an unhandled
 * rejection.
 */
export function useDashboardPoll(fetcher: () => Promise<void>, intervalMs: number): void {
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void fetcher();
    };
    run();
    const intervalId = window.setInterval(run, intervalMs);
    const onVisible = () => {
      if (!document.hidden) run();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', run);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', run);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher/intervalMs are expected to be stable per call site, matching the original two effects' `[]` deps
  }, []);
}
