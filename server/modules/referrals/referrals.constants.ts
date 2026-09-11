// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Ported from legacy/server/models/referralModel.ts */
export const REFERRAL_MINING_COMMISSION_RATE = 0.1;
export const REFERRAL_STATS_SINCE = new Date("2026-07-01T00:00:00.000Z");
/** Inline of legacy tournaments/depositTournamentScore.countsForDepositTournament — Fase 7 not migrated. */
export function countsForDepositTournament(rawTx) {
    if (!rawTx)
        return true;
    try {
        const j = JSON.parse(rawTx);
        if (j.source === "hd_deposit")
            return false;
    }
    catch {
        /* ignore */
    }
    return true;
}
