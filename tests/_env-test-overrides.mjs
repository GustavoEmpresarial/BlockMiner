/**
 * Test env overrides — loaded via `tsx --import` before test files.
 * Keeps tests from inventing timeouts/modes; prefer process env already set.
 */
if (!process.env.CHECKIN_GRACE_HOURS) {
  process.env.CHECKIN_GRACE_HOURS = "6";
}
if (!process.env.CHECKIN_MONITOR_ENABLED) {
  process.env.CHECKIN_MONITOR_ENABLED = "1";
}
// Keep unit/smoke from burning free proxy-API quotas unless a test opts in.
if (process.env.VPNAPI_ALLOW_LIVE !== "1") {
  process.env.VPNAPI_ENABLED = "false";
}
if (process.env.GETIPINTEL_ALLOW_LIVE !== "1") {
  process.env.GETIPINTEL_ENABLED = "false";
}
if (process.env.IPLOGS_ALLOW_LIVE !== "1") {
  process.env.IPLOGS_ENABLED = "false";
}
if (process.env.IPAPIIS_ALLOW_LIVE !== "1") {
  process.env.IPAPIIS_ENABLED = "false";
}
if (process.env.IPHUB_ALLOW_LIVE !== "1") {
  process.env.IPHUB_ENABLED = "false";
}
if (process.env.IPQS_ALLOW_LIVE !== "1") {
  process.env.IPQS_ENABLED = "false";
}
if (process.env.VPNBLOCKER_ALLOW_LIVE !== "1") {
  process.env.VPNBLOCKER_ENABLED = "false";
}
if (process.env.ABSTRACTAPI_ALLOW_LIVE !== "1") {
  process.env.ABSTRACTAPI_ENABLED = "false";
}
