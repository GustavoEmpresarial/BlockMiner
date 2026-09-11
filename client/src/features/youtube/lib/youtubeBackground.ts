import { useEffect, useSyncExternalStore } from 'react';

/**
 * Shared state between the /youtube page and the off-page Power Boost runner
 * (YoutubeBackgroundRunner). Lives in its own module so the runner — which is mounted app-wide
 * in ProtectedLayout — never has to import YouTubeWatchPage and drag the whole player page
 * (plus the YT IFrame API bootstrap) into the layout chunk.
 */

/** Written by YouTubeWatchPage whenever a video is loaded; off-page claims need a videoId. */
export const YT_LAST_VIDEO_KEY = 'blockminer:yt-last-video-id';

/** Cool-off after the daily cap so nothing retries until well past the UTC reset check. */
export const DAILY_LIMIT_BACKOFF_MS = 60 * 60 * 1000;

/** Must match the server gate (MIN_SECONDS_TO_CLAIM in youtube.repository.ts). */
export const DEFAULT_MIN_CLAIM_SEC = 45;

/** Floor for any error backoff: never hot-loop `/youtube/claim` (the rate limiter answers 429). */
export const ERROR_BACKOFF_MS = 20_000;

export interface ClaimBackoff {
    /** How long the off-page runner must wait before touching `/youtube/claim` again. */
    waitMs: number;
    /** True when the server said "nothing left today" — no point retrying before the UTC reset. */
    dailyLimit: boolean;
}

/**
 * Decides how hard to back off after a failed off-page claim.
 *
 * Pure so it can be unit tested: the exact shape of this decision is what caused a real
 * incident on the page side — a daily-cap 400 carries NO `retryAfterMs`, so treating it like
 * any other 400 produced one request + one error toast every tick for the rest of the UTC day,
 * which then tripped the rate limiter into 429s reported as unexpected failures.
 */
export function resolveClaimBackoff(
    status: number | undefined,
    retryAfterMs: number | null | undefined,
): ClaimBackoff {
    const retry = typeof retryAfterMs === 'number' && retryAfterMs > 0 ? retryAfterMs : 0;
    if (status === 400 && retry === 0) {
        return { waitMs: DAILY_LIMIT_BACKOFF_MS, dailyLimit: true };
    }
    return { waitMs: Math.max(ERROR_BACKOFF_MS, retry), dailyLimit: false };
}

/**
 * Page lease.
 *
 * Only ONE claim cycle may run per tab. The page has its own 1s claim watchdog, so if the
 * runner also ticked while /youtube was open both would fire `/youtube/claim` against the same
 * banked `ytSecondsBalance` and burn 2×45s of verified watch time for one reward cycle.
 *
 * A refcount owned by the page component (not a `location.pathname === '/youtube'` check, which
 * is what legacy used) because the invariant we actually care about is "the page component is
 * mounted and driving its own cycle" — that stays correct if the route path is ever renamed, if
 * the page is rendered from a second route, and it counts correctly under StrictMode's
 * double-mount. Not sessionStorage either: sessionStorage is per-tab exactly like a module
 * variable, so it buys nothing and adds a stale-lease-after-crash failure mode.
 */
let pageLeaseCount = 0;
const leaseListeners = new Set<() => void>();

function emitLease(): void {
    for (const l of leaseListeners) l();
}

function subscribeLease(listener: () => void): () => void {
    leaseListeners.add(listener);
    return () => {
        leaseListeners.delete(listener);
    };
}

function getLeaseSnapshot(): boolean {
    return pageLeaseCount > 0;
}

/** Called by YouTubeWatchPage: "I am mounted, I drive the claim cycle, runner stand down." */
export function useYoutubePageLease(): void {
    useEffect(() => {
        pageLeaseCount += 1;
        emitLease();
        return () => {
            pageLeaseCount = Math.max(0, pageLeaseCount - 1);
            emitLease();
        };
    }, []);
}

/** Called by the runner to know whether the page is currently in charge. */
export function useYoutubePageActive(): boolean {
    return useSyncExternalStore(subscribeLease, getLeaseSnapshot, () => true);
}

/** Test seam / logout cleanup: drop any lease left behind. */
export function resetYoutubePageLease(): void {
    pageLeaseCount = 0;
    emitLease();
}
