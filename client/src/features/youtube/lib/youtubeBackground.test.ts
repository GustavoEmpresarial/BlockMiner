import { describe, it, expect } from 'vitest';
import {
    DAILY_LIMIT_BACKOFF_MS,
    ERROR_BACKOFF_MS,
    resolveClaimBackoff,
} from './youtubeBackground';

describe('resolveClaimBackoff', () => {
    it('treats a 400 without retryAfterMs as the daily cap and waits an hour', () => {
        // The daily-limit 400 from youtube.service.ts carries only a message. Retrying it every
        // few seconds is the hot loop that produced 429s from the rate limiter.
        const backoff = resolveClaimBackoff(400, undefined);
        expect(backoff.dailyLimit).toBe(true);
        expect(backoff.waitMs).toBe(DAILY_LIMIT_BACKOFF_MS);
    });

    it('honours retryAfterMs on an insufficient-balance 400', () => {
        const backoff = resolveClaimBackoff(400, 45_000);
        expect(backoff.dailyLimit).toBe(false);
        expect(backoff.waitMs).toBe(45_000);
    });

    it('never waits less than the error floor, even for a tiny retryAfterMs', () => {
        expect(resolveClaimBackoff(400, 1_000).waitMs).toBe(ERROR_BACKOFF_MS);
        expect(resolveClaimBackoff(500, undefined).waitMs).toBe(ERROR_BACKOFF_MS);
        expect(resolveClaimBackoff(undefined, undefined).waitMs).toBe(ERROR_BACKOFF_MS);
    });

    it('does not mistake a non-400 failure for the daily cap', () => {
        // A 401 (expired session) or a network error must keep the short backoff: the user may
        // re-authenticate seconds later and an hour-long freeze would be a second regression.
        expect(resolveClaimBackoff(401, undefined).dailyLimit).toBe(false);
        expect(resolveClaimBackoff(429, undefined).dailyLimit).toBe(false);
    });

    it('ignores a non-positive retryAfterMs instead of scheduling in the past', () => {
        expect(resolveClaimBackoff(500, 0).waitMs).toBe(ERROR_BACKOFF_MS);
        expect(resolveClaimBackoff(500, -5_000).waitMs).toBe(ERROR_BACKOFF_MS);
    });
});
