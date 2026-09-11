/**
 * Full port of legacy/server/modules/antibot/domain/types.ts, merged with the previously
 * existing reduced-scope types (telemetry collection input/overview row) so nothing that
 * already depended on this file breaks.
 */
import type { AppPrisma } from "../../core/database/prisma.js";

export type EvidenceSeverity = "info" | "low" | "medium" | "high" | "critical";

/** A single signal produced by a detector. */
export interface AntibotEvidence {
  /** Detector id, e.g. "headless", "fingerprint". */
  detector: string;
  /** Stable machine code, e.g. "navigator_webdriver". */
  code: string;
  /** Human-readable reason (admin-facing). */
  reason: string;
  /** Points contributed to the risk score. */
  weight: number;
  severity: EvidenceSeverity;
  /** Free-form supporting detail (persisted as JSON, never blocks). */
  metadata?: Record<string, unknown>;
}

/** Telemetry payload collected by the browser client. */
export interface AntibotTelemetry {
  browser?: {
    webdriver?: boolean;
    headless?: boolean;
    selenium?: boolean;
    puppeteer?: boolean;
    playwright?: boolean;
    phantomjs?: boolean;
    electron?: boolean;
    automationApi?: boolean;
    userAgent?: string | null;
    knownAutomationUA?: boolean;
    inconsistentUA?: boolean;
    languages?: string[];
  };
  environment?: {
    language?: string | null;
    languages?: string[];
    timezone?: string | null;
    timezoneOffset?: number;
    screenResolution?: string | null;
    colorDepth?: number;
    hardwareConcurrency?: number;
    deviceMemory?: number;
    platform?: string | null;
    touchSupport?: boolean;
    cookiesEnabled?: boolean;
    localStorage?: boolean;
    sessionStorage?: boolean;
    vendor?: string | null;
    plugins?: number;
    mismatchedTimezone?: boolean;
  };
  device?: {
    deviceId?: string | null;
    fingerprint?: string | null;
    canvasHash?: string | null;
    webglVendor?: string | null;
    webglRenderer?: string | null;
    fontCount?: number;
  };
  behavior?: {
    navigationEvents?: number;
    avgActionIntervalMs?: number;
    intervalVarianceMs?: number;
    intervalCv?: number;
    clickDistribution?: number;
    sessionDurationMs?: number;
    repetitiveSequences?: number;
    impossibleSpeed?: boolean;
    humanLikeInput?: boolean;
    path?: string[];
  };
  /** Browser-integrity probe results (native API tampering, missing subsystems). */
  integrity?: {
    overriddenApiCount?: number;
    overriddenApis?: string[];
    navTampered?: boolean;
    noPermissions?: boolean;
    noChromeRuntime?: boolean;
    userscriptHint?: boolean;
    extensionScriptHint?: boolean;
    userscriptNetworkStack?: boolean;
    injectedInlineScript?: boolean;
    consoleTampered?: boolean;
    hookBypass?: boolean;
    userscriptManagerInstalled?: boolean;
    userscriptManagers?: string[];
  };
}

/** Context handed to every detector. */
export interface DetectorContext {
  prisma: AppPrisma;
  telemetry: AntibotTelemetry;
  userId: number | null;
  ip: string;
  userAgent: string;
  sessionId: string;
  eventType: string;
}

/** A modular, independent detector. */
export interface AntibotDetector {
  name: string;
  detect(ctx: DetectorContext): Promise<AntibotEvidence[]>;
}

/** Risk classification bands (0-100). */
export type RiskBand = "trusted" | "low" | "suspicious" | "high" | "critical";

export interface RiskClassification {
  score: number;
  band: RiskBand;
  label: string;
}

/** Snapshot of a user's antibot profile for the admin UI. */
export interface AntibotProfileView {
  userId: number;
  riskScore: number;
  trustScore: number;
  peakRiskScore: number;
  evidenceCount: number;
  band: RiskBand;
  lastEventAt: string | null;
  lastComputedAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Legacy scope-reduced types kept for backward compatibility (still used by
// sanitizeTelemetry()'s bounded generic form, and by anonymous-caller paths).
// ---------------------------------------------------------------------------

/** Bounded, sanitized generic telemetry payload — legacy shape kept for compatibility. */
export type SanitizedTelemetry = Record<string, unknown>;

export type CollectTelemetryInput = {
  userId: number | null;
  sessionId: string;
  eventType: string;
  ip: string;
  userAgent: string;
  /** Raw client body — sanitized inside collectTelemetry via sanitizeAntibotTelemetry. */
  telemetry: unknown;
};

export type AntibotOverviewRow = {
  id: number;
  userId: number;
  sessionId: string | null;
  eventType: string;
  ip: string | null;
  metadata: unknown;
  createdAt: Date;
};
