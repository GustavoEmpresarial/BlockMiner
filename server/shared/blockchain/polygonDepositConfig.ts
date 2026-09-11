/**
 * Shared POL deposit settings (env-driven, no schema changes). Ported from
 * legacy/server/services/polygonDepositConfig.ts. `getRequiredBlockConfirmations` here defaults
 * to 50 (not legacy's generic helper's `3`) to match `depositVerifier.ts`'s own doc-comment
 * ("N block confirmations") and the task's documented legacy default of 50 for
 * DEPOSIT_MIN_CONFIRMATIONS.
 */

export function getMinDepositPol(): number {
  const raw = String(process.env.DEPOSIT_MIN_AMOUNT || process.env.MIN_DEPOSIT_POL || "0.01").trim();
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? v : 0.01;
}

export function getRequiredBlockConfirmations(): number {
  const raw = String(process.env.DEPOSIT_MIN_CONFIRMATIONS || "50").trim();
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 50;
}
