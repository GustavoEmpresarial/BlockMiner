import { useEffect, useSyncExternalStore } from 'react';

/**
 * Shared state between the shortlink step page and the off-page Power Boost runner
 * (ShortlinkBackgroundRunner). Lives in its own module so the runner — which is mounted
 * app-wide in ProtectedLayout — never has to import ShortlinkStepPage and drag the ad-banner
 * components (AdBanner / MondiadBanner and their third-party bootstraps) into the layout chunk.
 */

/** Written by ShortlinksPage on start and rewritten by ShortlinkStepPage on every transition. */
export const SL_SESSION_KEY = 'sl_session';

/** "You left the page" latch. Set by ShortlinkStepPage only for NON-boosted users. */
export const SL_PAUSED_KEY = 'sl_paused';

/**
 * Must match `useResumableCountdown`'s storageKey in ShortlinkStepPage
 * (`sl_step_${currentStepNum}_timer`) — the runner debits the very same record the hook
 * restores from, so the two must agree byte-for-byte on the key.
 */
export function stepTimerKey(step: number): string {
    return `sl_step_${step}_timer`;
}

/**
 * Wall-clock debit cadence. 1s is deliberately cheap: this runner performs NO network I/O at
 * all (see ShortlinkBackgroundRunner's header), it only rewrites one sessionStorage record, so
 * there is no rate limiter to trip and no backoff ladder to climb. Background tabs throttled to
 * ~1 callback/minute are still correct because every tick recomputes from `savedAt` deltas
 * rather than assuming a tick actually happened every second.
 */
export const TICK_MS = 1_000;

/** Shape written by useResumableCountdown. Kept structurally identical on purpose. */
export interface StoredTimer {
    remaining: number;
    totalSeconds: number;
    savedAt: number;
    signature?: string | null;
}

export interface StoredSession {
    token: string;
    currentStep: number;
}

/**
 * Parses `sl_session`. Rejects anything the step page would also reject, because a malformed
 * record must never be turned into a timer key like `sl_step_undefined_timer` that then
 * accumulates junk in the user's sessionStorage forever.
 */
export function parseStoredSession(raw: string | null): StoredSession | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;
        const { token, currentStep } = parsed as { token?: unknown; currentStep?: unknown };
        if (typeof token !== 'string' || token.length === 0) return null;
        if (typeof currentStep !== 'number' || !Number.isInteger(currentStep) || currentStep < 1) {
            return null;
        }
        return { token, currentStep };
    } catch {
        return null;
    }
}

/** Parses one `sl_step_N_timer` record with the same field checks useResumableCountdown uses. */
export function parseStoredTimer(raw: string | null): StoredTimer | null {
    if (!raw) return null;
    try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return null;
        const t = parsed as StoredTimer;
        if (
            typeof t.remaining !== 'number' ||
            typeof t.totalSeconds !== 'number' ||
            typeof t.savedAt !== 'number' ||
            !Number.isFinite(t.remaining) ||
            !Number.isFinite(t.totalSeconds) ||
            !Number.isFinite(t.savedAt)
        ) {
            return null;
        }
        return {
            remaining: t.remaining,
            totalSeconds: t.totalSeconds,
            savedAt: t.savedAt,
            signature: t.signature ?? null,
        };
    } catch {
        return null;
    }
}

/**
 * Pure wall-clock debit for one off-page tick. Returns the record to write back, or `null`
 * when the runner must leave sessionStorage untouched.
 *
 * Every `null` case is a guard against a concrete failure, not defensive noise:
 *
 * - `remaining <= 0`: the countdown already finished off-page. Continuing to rewrite the record
 *   would keep refreshing `savedAt`, which is exactly what useResumableCountdown's `maxAgeMs`
 *   staleness check uses — an abandoned tab would then restore a "ready" button days later.
 *   Stop writing and the record ages out normally.
 *
 * - signature mismatch: `sl_step_1_timer` survives an abandoned run, and the next run reuses the
 *   same key with a NEW session token. useResumableCountdown refuses to restore across a
 *   signature change, so a runner that kept debiting the old record would be burning wall clock
 *   against a timer nobody will ever read. Worse, it keeps `savedAt` fresh, defeating the very
 *   staleness eviction that cleans it up.
 *
 * - `now < savedAt`: a backwards system-clock adjustment. Crediting a negative delta would ADD
 *   time to the countdown; clamping to zero elapsed is the only safe reading.
 *
 * Note what this function cannot do: it cannot make a step completable earlier than the server
 * allows. `/shortlink/complete-step` measures `now - stepStartedAt >= MIN_STEP_INTERVAL_MS`
 * (8s) against the server's OWN clock, and the client countdown is 10s of the same wall clock
 * started at the same moment. Ticking off-page merely stops the client from being artificially
 * stricter than the server; it can never be looser.
 */
export function advanceTimer(
    timer: StoredTimer,
    now: number,
    sessionToken: string,
): StoredTimer | null {
    if (timer.remaining <= 0) return null;
    if (timer.signature != null && timer.signature !== sessionToken) return null;

    const elapsedSec = Math.max(0, (now - timer.savedAt) / 1000);
    if (elapsedSec === 0) {
        // Nothing measurable passed (or the clock went backwards). Rewriting would only bump
        // `savedAt`, which is the staleness bump we are avoiding above.
        return null;
    }

    return {
        remaining: Math.max(0, timer.remaining - elapsedSec),
        totalSeconds: timer.totalSeconds,
        savedAt: now,
        signature: timer.signature ?? null,
    };
}

/**
 * Page lease.
 *
 * Only ONE thing may debit a given `sl_step_N_timer` at a time. While ShortlinkStepPage is
 * mounted it runs its own `useResumableCountdown` interval, and that hook writes the record on
 * unmount/pagehide from its in-memory `remainingRef`. If the runner also debited sessionStorage
 * during that time the hook's next write would simply clobber it (or vice-versa), producing a
 * countdown that jumps backwards on the user's screen.
 *
 * A refcount owned by the page component — not a `location.pathname` regex, which is what
 * legacy's ShortlinkBackgroundRunner used — because the invariant we actually care about is
 * "the step page is mounted and driving its own countdown". That stays correct if the
 * `/shortlink/internal-shortlink/step/:step` route is ever renamed, and it counts correctly
 * under StrictMode's double-mount.
 *
 * A plain boolean is deliberately enough for the 1→2→3 step transitions: ShortlinkStepPage
 * reuses ONE component instance across all three steps (that instance reuse is what forced
 * `cycleId` into useResumableCountdown), so the lease is held continuously for the whole run
 * and the runner is never awake during a transition. What the runner must still get right is
 * *which* step it debits after the user leaves — it re-reads `sl_session.currentStep` on every
 * tick and matches `signature` against the live session token, so a step that advanced while it
 * was asleep cannot leave it debiting the previous step's record.
 *
 * Not sessionStorage either: sessionStorage is per-tab exactly like a module variable, so it
 * buys nothing and adds a stale-lease-after-crash failure mode.
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

/** Called by ShortlinkStepPage: "I am mounted, I drive the countdown, runner stand down." */
export function useShortlinkPageLease(): void {
    useEffect(() => {
        pageLeaseCount += 1;
        emitLease();
        return () => {
            pageLeaseCount = Math.max(0, pageLeaseCount - 1);
            emitLease();
        };
    }, []);
}

/** Called by the runner to know whether the step page is currently in charge. */
export function useShortlinkPageActive(): boolean {
    return useSyncExternalStore(subscribeLease, getLeaseSnapshot, () => true);
}

/** Test seam / logout cleanup: drop any lease left behind. */
export function resetShortlinkPageLease(): void {
    pageLeaseCount = 0;
    emitLease();
}
