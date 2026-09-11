// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/games/gameCooldownEngine.ts.
 * Progressive cooldown engine — DB-backed, survives server restarts.
 * Progression: base 10s, +10s per 10 completed sessions, cap 300s.
 * Recovery: after 6h idle (from lastFinishedAt), subtract 10s per 6h elapsed, applied
 * lazily on next game:start. game2048 doesn't use this (it has its own claim-based
 * cooldown) — shared infra ready for the next server-side game module.
 */
import prisma from "../../core/database/prisma.js";
const BASE_COOLDOWN_S = 10;
const STEP_S = 10;
const TIER_SIZE = 10;
const MAX_COOLDOWN_S = 300;
const RECOVERY_INTERVAL_MS = 6 * 60 * 60 * 1000;
const RECOVERY_STEP_S = 10;
function computeCooldownSeconds(sessions) {
    const tier = Math.floor(sessions / TIER_SIZE);
    return Math.min(BASE_COOLDOWN_S + tier * STEP_S, MAX_COOLDOWN_S);
}
function applyRecovery(sessions, lastFinishedAt, now) {
    if (!lastFinishedAt || sessions <= 0)
        return sessions;
    const idleMs = now.getTime() - lastFinishedAt.getTime();
    if (idleMs < RECOVERY_INTERVAL_MS)
        return sessions;
    const recoverySteps = Math.floor(idleMs / RECOVERY_INTERVAL_MS) - 1;
    if (recoverySteps <= 0)
        return sessions;
    const recoveredS = recoverySteps * RECOVERY_STEP_S;
    const currentCooldownS = computeCooldownSeconds(sessions);
    const newCooldownS = Math.max(BASE_COOLDOWN_S, currentCooldownS - recoveredS);
    const newTier = Math.floor((newCooldownS - BASE_COOLDOWN_S) / STEP_S);
    return Math.max(0, newTier * TIER_SIZE);
}
/** Returns null if OK to play, or { remainingSeconds } if blocked. Applies lazy recovery and persists it. */
export async function checkCooldown(userId, gameSlug) {
    const now = new Date();
    const state = await prisma.gameCooldownState.findUnique({ where: { userId_gameSlug: { userId, gameSlug } } });
    if (!state)
        return null;
    const recoveredSessions = applyRecovery(state.sessions, state.lastFinishedAt, now);
    if (recoveredSessions !== state.sessions) {
        await prisma.gameCooldownState.update({ where: { id: state.id }, data: { sessions: recoveredSessions } });
    }
    if (!state.cooldownEndsAt)
        return null;
    const remaining = state.cooldownEndsAt.getTime() - now.getTime();
    if (remaining <= 0)
        return null;
    return { remainingSeconds: Math.ceil(remaining / 1000) };
}
/** Record a completed game session and advance the cooldown state. Call only after a confirmed successful finish. */
export async function recordFinish(userId, gameSlug) {
    const now = new Date();
    const existing = await prisma.gameCooldownState.findUnique({ where: { userId_gameSlug: { userId, gameSlug } } });
    const currentSessions = existing ? applyRecovery(existing.sessions, existing.lastFinishedAt, now) : 0;
    const newSessions = currentSessions + 1;
    const cooldownS = computeCooldownSeconds(newSessions);
    const cooldownEndsAt = new Date(now.getTime() + cooldownS * 1000);
    await prisma.gameCooldownState.upsert({
        where: { userId_gameSlug: { userId, gameSlug } },
        create: { userId, gameSlug, sessions: newSessions, lastFinishedAt: now, cooldownEndsAt },
        update: { sessions: newSessions, lastFinishedAt: now, cooldownEndsAt },
    });
}
/** Effective cooldown seconds for the user's NEXT session (for display). */
export async function getCooldownSeconds(userId, gameSlug) {
    const state = await prisma.gameCooldownState.findUnique({ where: { userId_gameSlug: { userId, gameSlug } } });
    if (!state)
        return BASE_COOLDOWN_S;
    const sessions = applyRecovery(state.sessions, state.lastFinishedAt, new Date());
    return computeCooldownSeconds(sessions + 1);
}
