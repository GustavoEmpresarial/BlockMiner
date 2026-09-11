// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Derives the player-facing state of a Mini Pass season.
 */
export function getMiniPassSeasonState(season, now = new Date()) {
    if (!season || season.deletedAt)
        return "hidden";
    if (!season.isActive)
        return "hidden";
    const startsAt = season.startsAt?.getTime?.();
    const endsAt = season.endsAt?.getTime?.();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt < startsAt) {
        return "hidden";
    }
    const t = now.getTime();
    if (t < startsAt)
        return "upcoming";
    if (t <= endsAt)
        return "live";
    return "ended";
}
export function isMiniPassSeasonVisible(season, now = new Date()) {
    const state = getMiniPassSeasonState(season, now);
    return state === "upcoming" || state === "live";
}
export function isMiniPassSeasonLive(season, now = new Date()) {
    return getMiniPassSeasonState(season, now) === "live";
}
