/**
 * Feature flags for custodial Polygon HD deposit addresses.
 *
 * Ported from legacy/server/services/polygonHdConfig.ts. current/'s app process only ever
 * runs the REMOTE branch (calling the isolated `phd` microservice) — it never holds
 * POLYGON_HD_MNEMONIC itself. See docs/PROGRESSO.txt for the security-isolation rationale.
 *
 * Real bug fixed alongside this port: balance.controller.ts previously read
 * `POLYGON_HD_DEPOSIT_FEATURE`, a name that never existed in legacy and doesn't match the
 * `POLYGON_HD_DEPOSIT_ENABLED` string already shown to real users in the client's i18n hints
 * (client/src/i18n/locales/*.json, "server_env_hint" etc.) — always false regardless of env.
 */

/** UI / API: operator turned the feature on (may still be missing secrets). */
export function isPolygonHdFeatureFlagged(): boolean {
  return process.env.POLYGON_HD_DEPOSIT_ENABLED === "1";
}

/**
 * When the feature flag is on but the server cannot allocate addresses yet — current/'s app
 * process only supports the remote (`phd` microservice) path, no local-mnemonic fallback.
 */
export function listPolygonHdMissingEnvKeys(): string[] {
  if (!isPolygonHdFeatureFlagged()) return [];
  const missing: string[] = [];
  const hasUrl = Boolean((process.env.PHD_SERVICE_URL || "").trim());
  const hasToken = Boolean((process.env.PHD_INTERNAL_TOKEN || "").trim());
  if (!hasUrl) missing.push("PHD_SERVICE_URL");
  if (!hasToken) missing.push("PHD_INTERNAL_TOKEN");
  return missing;
}

/** Minimum POL credited for txs to the user's HD deposit address (default 1). */
export function getPolygonHdMinDepositPol(): number {
  const raw = String(process.env.POLYGON_HD_MIN_DEPOSIT_POL || "1").trim();
  const v = parseFloat(raw);
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** True when HD allocation and verification can run (secrets present). */
export function isPolygonHdDepositEnabled(): boolean {
  if (!isPolygonHdFeatureFlagged()) return false;
  return listPolygonHdMissingEnvKeys().length === 0;
}
