/**
 * Antibot application service — telemetry collect + admin investigation surface.
 */
import { analyze, bandForScore } from "./antibot.riskEngine.js";
import { sanitizeAntibotTelemetry } from "./antibot.telemetrySchema.js";
import { antibotEventAllowed, antibotGamesOnly } from "./antibot.event-policy.js";
import type { AppPrisma } from "../../core/database/prisma.js";
import type { CollectTelemetryInput } from "./antibot.types.js";
import {
  adminOverviewData,
  clearAllAntibotData,
  countDistinctUsersWithEvidence,
  countEvidence,
  getUserFullProfile,
  listAlertsPaginated,
  listDevicesPaginated,
  listEvidencePaginated,
  listRecentEvidence,
  listSessionsPaginated,
  recomputeUserScore,
  setUserTrusted,
  setUserTrustedReason,
  updateAlertStatus,
} from "./antibot.repository.js";

export { antibotEventAllowed, antibotGamesOnly } from "./antibot.event-policy.js";

const MAX_STRING = 200;
const MAX_ARRAY_ITEMS = 20;
const MAX_ARRAY_ITEM_LEN = 40;
const MAX_TOP_LEVEL_KEYS = 40;

function boundValue(v: unknown): unknown {
  if (v === null || typeof v === "boolean" || typeof v === "number") return v;
  if (typeof v === "string") return v.slice(0, MAX_STRING);
  if (Array.isArray(v)) {
    return v
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => (typeof item === "string" ? item.slice(0, MAX_ARRAY_ITEM_LEN) : boundValue(item)));
  }
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(v as Record<string, unknown>).slice(0, MAX_TOP_LEVEL_KEYS);
    for (const [k, val] of entries) out[k.slice(0, 60)] = boundValue(val);
    return out;
  }
  return undefined;
}

/**
 * Bounded sanitizer for admin/raw display. Detector pipeline uses sanitizeAntibotTelemetry.
 */
export function sanitizeTelemetry(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return boundValue(raw) as Record<string, unknown>;
}

/**
 * Restricted telemetry surface (default on).
 * Accepts game* + site:integrity* so F12/userscript probes cover the whole app
 * without re-opening legacy full-site browsing flood (impossible_speed FP).
 * Set ANTIBOT_GAMES_ONLY=0 for unrestricted eventTypes, or override with
 * ANTIBOT_EVENT_ALLOWLIST=game,site:integrity,auth (comma prefixes).
 * Implementation: antibot.event-policy.ts
 */

/** Runs the full risk engine on a telemetry beacon. Never throws past analyze. */
export async function collectTelemetry(prisma: AppPrisma, input: CollectTelemetryInput) {
  if (!antibotEventAllowed(input.eventType)) {
    return { skipped: true as const };
  }
  const telemetry = sanitizeAntibotTelemetry(input.telemetry);
  return analyze({
    prisma,
    userId: input.userId,
    telemetry,
    ip: input.ip,
    userAgent: input.userAgent,
    sessionId: input.sessionId,
    eventType: input.eventType,
  });
}

export async function getAntibotAdminOverview(prisma: AppPrisma, limit: number) {
  return adminOverviewData(prisma, limit);
}

export async function listAntibotEvidence(
  prisma: AppPrisma,
  filters: Parameters<typeof listEvidencePaginated>[1],
  page: number,
  limit: number,
) {
  return listEvidencePaginated(prisma, filters, page, limit);
}

export async function listAntibotSessions(
  prisma: AppPrisma,
  filters: Parameters<typeof listSessionsPaginated>[1],
  page: number,
  limit: number,
) {
  return listSessionsPaginated(prisma, filters, page, limit);
}

export async function listAntibotDevices(prisma: AppPrisma, minAccounts: number, page: number, limit: number) {
  return listDevicesPaginated(prisma, minAccounts, page, limit);
}

export async function listAntibotAlerts(
  prisma: AppPrisma,
  filters: Parameters<typeof listAlertsPaginated>[1],
  page: number,
  limit: number,
) {
  return listAlertsPaginated(prisma, filters, page, limit);
}

export async function updateAntibotAlert(prisma: AppPrisma, id: number, status: string) {
  return updateAlertStatus(prisma, id, status);
}

export async function setAntibotUserTrusted(
  prisma: AppPrisma,
  userId: number,
  trusted: boolean,
  reason: string | null,
) {
  await setUserTrusted(prisma, userId, trusted);
  if (reason !== null || !trusted) {
    await setUserTrustedReason(prisma, userId, reason);
  }
}

export async function recomputeAntibotUserScore(prisma: AppPrisma, userId: number) {
  const result = await recomputeUserScore(prisma, userId);
  return { ...result, band: bandForScore(result.score) };
}

export async function getAntibotUserProfile(prisma: AppPrisma, userId: number, evidenceLimit: number) {
  const data = await getUserFullProfile(prisma, userId, evidenceLimit);
  if (!data.user) return null;
  const score = data.profile?.riskScore ?? 0;
  return {
    user: data.user,
    profile: data.profile
      ? { ...data.profile, band: bandForScore(score) }
      : {
          userId,
          riskScore: 0,
          trustScore: 100,
          peakRiskScore: 0,
          evidenceCount: 0,
          lastEventAt: null,
          lastComputedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          band: "trusted" as const,
        },
    evidence: data.evidence,
    sessions: data.sessions,
    devices: data.devices,
  };
}

export async function resetAntibot(prisma: AppPrisma) {
  return clearAllAntibotData(prisma);
}

export async function getAntibotOverview(prisma: AppPrisma, limit: number) {
  const [totalEvidence, distinctUsers, recent] = await Promise.all([
    countEvidence(prisma),
    countDistinctUsersWithEvidence(prisma),
    listRecentEvidence(prisma, limit),
  ]);
  return { totalEvidence, distinctUsers, recent };
}
