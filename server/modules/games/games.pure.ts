// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Pure input-validation + pure-mechanics helpers for the games socket dispatcher. Ported from
 * legacy/server/src/socket/gamesSocket.pure.ts. Covers crypto-memory, crypto-match-3 and
 * sky-runner. `cart-rush` pure helpers live separately in games.cartrush.pure.ts (ported from
 * gamesSocket.cart.ts) since they're a materially different shape (tick/event math, not input
 * validation).
 */
export const GAME_SLUG_MAX_LEN = 64;
/**
 * Minimum plausible elapsed time (ms) a legit client needs to pass `pipesPassed` pipes.
 * Anti-cheat floor: the first pipe must scroll in from off-screen, then each subsequent pipe is
 * spaced by `spawnDx` at the max scroll speed. An 80% factor leaves slack for GC-induced bursts
 * so we only reject blatantly impossible timing. Geometry is passed in so the physics constants
 * stay single-sourced in the handler (which also ships them to the client).
 */
export function skyMinElapsedMsForPipes(pipesPassed, geom) {
    const firstPipeMs = ((geom.worldW + 200 - geom.planeX) / geom.maxSpeed) * 1000;
    const perPipeMs = (geom.spawnDx / geom.maxSpeed) * 1000;
    if (pipesPassed <= 0)
        return 0;
    return Math.floor((firstPipeMs + (pipesPassed - 1) * perPipeMs) * 0.8);
}
/** Validates and canonicalizes a game slug against the known-games map, else null. */
export function parseGameSlug(raw, names) {
    if (typeof raw !== "string")
        return null;
    const s = raw.trim();
    if (!s || s.length > GAME_SLUG_MAX_LEN)
        return null;
    return Object.prototype.hasOwnProperty.call(names, s) ? s : null;
}
/** Reads an {x,y} match-3 grid coordinate, rejecting anything off the 8x8 board. */
export function readMatch3GridCoord(p) {
    if (!p || typeof p !== "object" || Array.isArray(p))
        return null;
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 7 || y < 0 || y > 7)
        return null;
    return { x, y };
}
/** Coerces `raw` to a finite number within [min, max], else null. */
export function readClampedNumber(raw, min, max) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max)
        return null;
    return n;
}
