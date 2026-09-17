export function isTournamentEngineV2Enabled(): boolean {
  const v = String(process.env.TOURNAMENT_ENGINE_V2 || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function isTournamentSkipGetRecomputeEnabled(): boolean {
  // Public GET never recomputes (amplification). Kept as always-on so older
  // call sites / env docs stay meaningful; engine V2 also implies skip.
  return true;
}

export function isTournamentIncrementalScoringEnabled(): boolean {
  return isTournamentEngineV2Enabled();
}

/**
 * Lets the offerwall reconcile repair entry scores instead of only reporting drift.
 * Off by default: it rewrites the live ranking of tournaments that pay prizes.
 */
export function isOfferwallAutocorrectEnabled(): boolean {
  const v = String(process.env.TOURNAMENT_OFFERWALL_AUTOCORRECT || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}
