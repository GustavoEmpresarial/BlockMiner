export {
  runIntegrityProbe,
  looksNative,
  listOverriddenApis,
  stackLooksLikeUserscript,
  integritySeverity,
  SITE_INTEGRITY_PROBE_INTERVAL_MS,
  SITE_INTEGRITY_MIN_REPORT_GAP_MS,
  BM_INTEGRITY_HOOK_MARK,
  type IntegrityProbeResult,
} from "./integrity.probe";
export {
  probeUserscriptManagerMarkers,
  probeUserscriptManagersInstalled,
  USERSCRIPT_MANAGER_WAR_PROBES,
  type UserscriptManagerId,
} from "./integrity.managers";
export {
  BLOCKED_USERSCRIPT_MANAGER_IDS,
  USERSCRIPT_MANAGER_LOGOUT_REASON,
  USERSCRIPT_MANAGER_BLOCKED_CODE,
  hasBlockedUserscriptManager,
  filterBlockedUserscriptManagers,
  userscriptManagerKickEnabled,
  loginUrlWithUserscriptReason,
} from "./integrity.policy";
export { enforceUserscriptManagerLogout, maybeKickFromIntegrityManagers } from "./integrity.enforce";
export {
  installIntegrityHooks,
  getIntegrityHookFlags,
  stopIntegrityHooks,
  type IntegrityHookFlags,
} from "./integrity.hooks";
export {
  startSiteIntegrityMonitoring,
  reportSiteIntegrity,
  getLastIntegrityProbe,
  type IntegrityReportReason,
} from "./integrity.report";
