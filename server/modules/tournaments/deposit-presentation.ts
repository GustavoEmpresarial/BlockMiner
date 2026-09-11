// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
export function depositRankingUnit(metric) {
    return metric === "DEPOSITS_USD" ? "usd" : "pol_legacy";
}
export function isDepositTournamentMetric(metric) {
    return metric === "DEPOSITS_USD" || metric === "DEPOSITS_POL";
}
export function normalizeDepositSummary(metric, raw) {
    if (!raw)
        return null;
    const unit = depositRankingUnit(metric);
    const totalPol = Number(raw.totalPol ?? 0);
    const totalUsd = raw.totalUsd != null ? Number(raw.totalUsd) : null;
    const largestPol = Number(raw.largestDepositPol ?? 0);
    const largestUsd = raw.largestDepositUsd != null ? Number(raw.largestDepositUsd) : null;
    const remainderPol = Number(raw.remainderPol ?? 0);
    const remainderUsd = raw.remainderUsd != null ? Number(raw.remainderUsd) : null;
    return {
        rankingUnit: unit,
        totalPol,
        totalUsd,
        txCount: Number(raw.txCount ?? 0),
        participantCount: Number(raw.participantCount ?? 0),
        largestDepositPol: largestPol,
        largestDepositUsd: largestUsd,
        remainderPol,
        remainderUsd,
        remainderTxCount: Number(raw.remainderTxCount ?? 0),
    };
}
