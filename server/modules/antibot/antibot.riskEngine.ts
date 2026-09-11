/**
 * Runs the detector pipeline and persists windowed risk scores + alerts.
 */
import { logger } from "../../core/logger/index.js";
import type { AppPrisma } from "../../core/database/prisma.js";
import type { AntibotEvidence, AntibotTelemetry, RiskBand } from "./antibot.types.js";
import {
  headlessDetector,
  environmentDetector,
  sessionDetector,
  deviceDetector,
  fingerprintDetector,
  relationshipDetector,
  behaviorDetector,
  browserIntegrityDetector,
} from "./detectors/index.js";
import {
  bandForScore,
  maybeCreateAlert,
  persistEvidence,
  shouldAlertRisk,
  shouldAlertSharedDevice,
} from "./antibot.repository.js";

const log = logger.child("antibot.riskEngine");

export { bandForScore };

const DETECTORS = [
  headlessDetector,
  environmentDetector,
  sessionDetector,
  deviceDetector,
  fingerprintDetector,
  relationshipDetector,
  behaviorDetector,
  browserIntegrityDetector,
];

const AUTOMATION_CODES = new Set([
  "selenium",
  "puppeteer",
  "playwright",
  "headless_browser",
  "phantomjs",
  "automation_api",
  "navigator_webdriver",
]);

export type AnalyzeInput = {
  prisma: AppPrisma;
  userId: number | null;
  telemetry: AntibotTelemetry;
  ip: string;
  userAgent: string;
  sessionId: string;
  eventType: string;
};

export type AnalyzeResult = {
  scoreBefore: number;
  scoreAfter: number;
  evidence: AntibotEvidence[];
  band: RiskBand;
};

/** Run all detectors and update the user's score. Never throws from a single detector. */
export async function analyze(input: AnalyzeInput): Promise<AnalyzeResult> {
  const { prisma, userId, telemetry, ip, userAgent, sessionId, eventType } = input;
  const ctx = { prisma, telemetry, userId, ip, userAgent, sessionId, eventType };
  const allEvidence: AntibotEvidence[] = [];

  for (const detector of DETECTORS) {
    try {
      const ev = await detector.detect(ctx);
      allEvidence.push(...ev);
    } catch (err) {
      log.warn("detector_failed", {
        detector: detector.name,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (userId == null) {
    return { scoreBefore: 0, scoreAfter: 0, evidence: allEvidence, band: "trusted" };
  }

  const dev = telemetry.device ?? {};
  const { scoreBefore, scoreAfter } = await persistEvidence(prisma, {
    userId,
    sessionId,
    eventType,
    ip: ip || null,
    deviceId: dev.deviceId ?? null,
    fingerprint: dev.fingerprint ?? null,
    evidence: allEvidence,
  });

  await generateAlerts(prisma, {
    userId,
    scoreAfter,
    evidence: allEvidence,
    ip,
    deviceId: dev.deviceId ?? null,
    fingerprint: dev.fingerprint ?? null,
  }).catch((err) =>
    log.warn("alert_generation_failed", { err: err instanceof Error ? err.message : String(err) }),
  );

  return {
    scoreBefore,
    scoreAfter,
    evidence: allEvidence,
    band: bandForScore(scoreAfter),
  };
}

async function generateAlerts(
  prisma: AppPrisma,
  p: {
    userId: number;
    scoreAfter: number;
    evidence: AntibotEvidence[];
    ip: string;
    deviceId: string | null;
    fingerprint: string | null;
  },
): Promise<void> {
  if (shouldAlertRisk(p.scoreAfter)) {
    await maybeCreateAlert(prisma, {
      type: "high_risk_score",
      severity: p.scoreAfter >= 81 ? "critical" : "high",
      userId: p.userId,
      riskScore: p.scoreAfter,
      ip: p.ip || null,
      deviceId: p.deviceId,
      fingerprint: p.fingerprint,
      message: `Risk score reached ${p.scoreAfter}`,
      details: { codes: p.evidence.map((e) => e.code) },
    });
  }

  const automation = p.evidence.find((e) => AUTOMATION_CODES.has(e.code));
  if (automation) {
    await maybeCreateAlert(prisma, {
      type: "automation_detected",
      severity: "critical",
      userId: p.userId,
      riskScore: p.scoreAfter,
      ip: p.ip || null,
      deviceId: p.deviceId,
      fingerprint: p.fingerprint,
      message: `Known automation runtime: ${automation.code}`,
      details: { code: automation.code, detector: automation.detector },
    });
  }

  // Client-reported impossible_speed is weak/noisy — only raise an alert when the
  // windowed score already crossed the risk threshold (corroborated / high band).
  const impossible = p.evidence.find((e) => e.code === "impossible_speed");
  if (impossible && shouldAlertRisk(p.scoreAfter)) {
    await maybeCreateAlert(prisma, {
      type: "impossible_behavior",
      severity: "critical",
      userId: p.userId,
      riskScore: p.scoreAfter,
      ip: p.ip || null,
      message: "Action sequence impossible for a human",
      details: { code: impossible.code },
    });
  }

  const shared = p.evidence.find((e) => e.code === "shared_device_many_accounts");
  if (shared && shouldAlertSharedDevice(Number(shared.metadata?.accountCount ?? 0))) {
    await maybeCreateAlert(prisma, {
      type: "shared_device",
      severity: "high",
      userId: p.userId,
      riskScore: p.scoreAfter,
      deviceId: p.deviceId,
      ip: p.ip || null,
      message: `Device used by ${shared.metadata?.accountCount} accounts`,
      details: { deviceId: p.deviceId, accountCount: shared.metadata?.accountCount },
    });
  }
}
