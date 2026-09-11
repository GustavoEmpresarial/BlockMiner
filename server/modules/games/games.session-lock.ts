// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/games/gameActiveSessionLock.ts.
 * One in-flight minigame per user + gameSlug (blocks multi-tab parallel farming).
 * In-memory per Node process — matches socket game sessions. Not yet wired to any
 * route in current/ (game2048 is pure HTTP and doesn't need it, matching legacy);
 * this is shared infra ready for the next socket-based game module.
 */
const byUserGame = new Map();
const keysBySocket = new Map();
function key(userId, gameSlug) {
    return `${userId}:${gameSlug}`;
}
export function tryAcquireUserGameSession(userId, gameSlug, socketId) {
    const k = key(userId, gameSlug);
    const holder = byUserGame.get(k);
    if (holder && holder !== socketId)
        return false;
    byUserGame.set(k, socketId);
    let set = keysBySocket.get(socketId);
    if (!set) {
        set = new Set();
        keysBySocket.set(socketId, set);
    }
    set.add(k);
    return true;
}
export function releaseUserGameSession(userId, gameSlug, socketId) {
    const k = key(userId, gameSlug);
    if (byUserGame.get(k) === socketId)
        byUserGame.delete(k);
    keysBySocket.get(socketId)?.delete(k);
}
export function releaseAllUserGameSessionsForSocket(socketId) {
    const keys = keysBySocket.get(socketId);
    if (!keys)
        return;
    for (const k of keys)
        byUserGame.delete(k);
    keysBySocket.delete(socketId);
}
/** Drop stale holder if socket disconnected or session ended. */
export function clearStaleUserGameSession(userId, gameSlug, isLive) {
    const k = key(userId, gameSlug);
    const socketId = byUserGame.get(k);
    if (!socketId)
        return;
    if (!isLive(socketId)) {
        byUserGame.delete(k);
        keysBySocket.get(socketId)?.delete(k);
    }
}
