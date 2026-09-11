/**
 * Public boundary of the antibot module. Other modules must import ONLY from here.
 *
 * Full port of legacy/server/modules/antibot — the 7-detector risk engine (headless,
 * environment, session, device, fingerprint, relationship, behavior, browserIntegrity),
 * windowed-score aggregation (antibot.weights.ts), and the full admin investigation API
 * (overview, evidence, sessions, devices, alerts, alert triage, user profile, trust,
 * recompute, reset).
 */
export { antibotRouter, antibotAdminRouter } from "./antibot.routes.js";
export { analyze, bandForScore } from "./antibot.riskEngine.js";
export { sanitizeTelemetry, collectTelemetry, getAntibotOverview } from "./antibot.service.js";
export { sanitizeAntibotTelemetry } from "./antibot.telemetrySchema.js";
export { ANTIBOT_ERROR, type AntibotErrorCode } from "./antibot.errors.js";
export type {
  AntibotEvidence,
  AntibotTelemetry,
  AntibotDetector,
  DetectorContext,
  RiskBand,
  RiskClassification,
  AntibotProfileView,
  SanitizedTelemetry,
  CollectTelemetryInput,
  AntibotOverviewRow,
} from "./antibot.types.js";
