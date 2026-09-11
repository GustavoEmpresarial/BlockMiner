/**
 * Client antibot feature — site-wide integrity probes (F12 / Tampermonkey),
 * game telemetry hooks, and critical-action beacons.
 *
 * Server counterpart: server/modules/antibot/
 */
export {
  runIntegrityProbe,
  looksNative,
  listOverriddenApis,
  stackLooksLikeUserscript,
  integritySeverity,
  SITE_INTEGRITY_PROBE_INTERVAL_MS,
  SITE_INTEGRITY_MIN_REPORT_GAP_MS,
  installIntegrityHooks,
  getIntegrityHookFlags,
  startSiteIntegrityMonitoring,
  reportSiteIntegrity,
  getLastIntegrityProbe,
  type IntegrityProbeResult,
  type IntegrityReportReason,
  type IntegrityHookFlags,
} from "./integrity/index";
