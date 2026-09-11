// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/** Allowed swap pairs — no DB imports (unit-testable). */
export const VALID_SWAP_PAIRS = [
    ["POL", "BLK"],
    ["SHIB", "BLK"],
];
export function isValidSwapPair(fromAsset, toAsset) {
    return VALID_SWAP_PAIRS.some(([f, t]) => f === fromAsset && t === toAsset);
}
