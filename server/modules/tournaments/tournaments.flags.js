export function isTournamentEngineV2Enabled() {
    const v = String(process.env.TOURNAMENT_ENGINE_V2 || "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
}
export function isTournamentSkipGetRecomputeEnabled() {
    if (isTournamentEngineV2Enabled())
        return true;
    const v = String(process.env.TOURNAMENT_SKIP_GET_RECOMPUTE || "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
}
export function isTournamentIncrementalScoringEnabled() {
    return isTournamentEngineV2Enabled();
}
/**
 * Lets the offerwall reconcile repair entry scores instead of only reporting drift.
 * Off by default: it rewrites the live ranking of tournaments that pay prizes.
 */
export function isOfferwallAutocorrectEnabled() {
    const v = String(process.env.TOURNAMENT_OFFERWALL_AUTOCORRECT || "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes";
}
