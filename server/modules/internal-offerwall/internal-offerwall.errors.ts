// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Error codes used across the internal-offerwall controller/service — ported from
 *  the string literals legacy/internal-offerwall.service.ts + .controller.ts returned. */
export const INTERNAL_OFFERWALL_ERROR = {
    FEATURE_DISABLED: "FEATURE_DISABLED",
    TASK_NOT_AVAILABLE: "TASK_NOT_AVAILABLE",
    TASK_LIMIT_REACHED: "TASK_LIMIT_REACHED",
    ATTEMPT_NOT_FOUND: "ATTEMPT_NOT_FOUND",
    INVALID_STATE: "INVALID_STATE",
    INVALID_ATTEMPT: "INVALID_ATTEMPT",
    NOT_PTC_OFFER: "NOT_PTC_OFFER",
    NO_PARTNER_URL: "NO_PARTNER_URL",
    PARTNER_NOT_OPENED: "PARTNER_NOT_OPENED",
    MIN_VIEW_NOT_MET: "MIN_VIEW_NOT_MET",
    CANNOT_ABANDON_PENDING_REVIEW: "CANNOT_ABANDON_PENDING_REVIEW",
    CONFLICT: "CONFLICT",
    REWARD_CONFIG_INVALID: "REWARD_CONFIG_INVALID",
};
/** Thrown inside the submit-attempt transaction when the reward config on the offer
 *  is missing/invalid — caller maps this to REWARD_CONFIG_INVALID (400). */
export class InternalOfferwallRewardConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "InternalOfferwallRewardConfigError";
    }
}
/** Thrown inside the submit-attempt transaction when the attempt row changed under us
 *  (already completed/abandoned by a concurrent request) — caller maps this to 409 CONFLICT. */
export class InternalOfferwallConflictError extends Error {
    constructor(message = "Attempt was already updated.") {
        super(message);
        this.name = "InternalOfferwallConflictError";
    }
}
