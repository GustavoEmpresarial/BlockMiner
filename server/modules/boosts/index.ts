// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
export { boostsRouter } from "./boosts.routes.js";
export { activateBoost, getPowerBoostStatus, hasActiveBoost, hasActiveBoostTx, getRewardDurationMs, getRewardDurationMsTx, resolveRewardExpiresAtForGrant, formatRewardDurationPt, rewardDurationHoursFromMs, computeRewardExpiresAt, boostEntitlementExpiresAt, todayKeyUTC, BOOST_COST_POL, BOOST_TTL_MS, NORMAL_TTL_MS, BOOST_DURATION_HOURS, NORMAL_DURATION_HOURS, } from "./boosts.service.js";
