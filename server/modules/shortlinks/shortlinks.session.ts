// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Ported from legacy/server/modules/shortlinks/application/shortlinks.service.ts
 * (`generateStepToken`) — split into its own file because the 3-step stateful
 * flow's step-token generation/validation and anti-fraud timing checks are
 * cohesive, independently testable logic distinct from the DB-orchestration
 * in shortlinks.service.ts (per-module judgment call allowed by the doctrine
 * for real complexity, mirroring checkin's split into checkin.streak.ts /
 * checkin.chain.ts etc.).
 *
 * JWT_SECRET is read directly from process.env, same as legacy — auth's
 * shared/security/authTokens.ts does not export its `requireJwtSecret`
 * helper, so we mirror legacy's own inline fallback for local dev instead of
 * duplicating a new exported helper in auth/ just for this.
 */
import { createHash } from "node:crypto";
const DEV_FALLBACK_SECRET = "fallback-secret-for-dev";
function getJwtSecret() {
    return process.env.JWT_SECRET || DEV_FALLBACK_SECRET;
}
/** Per-step session token = SHA-256(userId + step + JWT_SECRET + timestamp). */
export function generateStepToken(userId, step, now = new Date()) {
    const secret = getJwtSecret();
    return createHash("sha256").update(`${userId}-${step}-${secret}-${now.getTime()}`).digest("hex");
}
/** Anti-fraud checks: token mismatch, script-triggered ("untrusted") click, too-fast step transition. */
export function detectStepFraud(input) {
    const incidents = [];
    if (input.expectedToken !== input.providedToken)
        incidents.push("token_mismatch");
    if (input.isUntrustedEvent)
        incidents.push("script_click");
    const startTime = input.stepStartedAt ? input.stepStartedAt.getTime() : 0;
    const timeElapsed = input.now.getTime() - startTime;
    if (timeElapsed < input.minIntervalMs)
        incidents.push("too_fast");
    return incidents;
}
