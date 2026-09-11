/**
 * Full port of legacy/server/modules/antibot/infrastructure/repositories/repository.ts,
 * merged with the previously existing reduced-scope read helpers (kept for the legacy
 * generic-evidence overview / smoke-test compatibility).
 *
 * All DB access is isolated here so detectors and the risk engine stay pure.
 */
import { Prisma } from "@prisma/client";
import type { AppPrisma } from "../../core/database/prisma.js";
import type { AntibotEvidence, CollectTelemetryInput, EvidenceSeverity, RiskBand } from "./antibot.types.js";
import {
  ALERT_DEVICE_ACCOUNT_THRESHOLD,
  ALERT_RISK_THRESHOLD,
  MAX_SCORE,
  SCORE_WINDOW_DAYS,
  computeScoreFromActiveCodes,
  resolveWeight,
} from "./antibot.weights.js";

export function bandForScore(score: number): RiskBand {
  if (score <= 20) return "trusted";
  if (score <= 40) return "low";
  if (score <= 60) return "suspicious";
  if (score <= 80) return "high";
  return "critical";
}

export function clampScore(n: number): number {
  return Math.max(0, Math.min(MAX_SCORE, Math.round(n)));
}

/** Compute decayed current score for a user (creates profile if missing). */
export async function getOrCreateProfile(prisma: AppPrisma, userId: number) {
  return prisma.antibotProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

/**
 * State-based score for a user: read the DISTINCT evidence codes seen inside the scoring
 * window, take each code's highest weight ONCE, then apply the corroboration gate
 * (antibot.weights.ts). The same code firing on many beacons counts as one code, and
 * spoofable client booleans cannot alone reach a ban band without a server-corroborated
 * signal.
 */
type EvidenceGroupByReader = {
  antibotEvidence: { groupBy: AppPrisma["antibotEvidence"]["groupBy"] };
};

export async function computeWindowedScore(
  prisma: AppPrisma | EvidenceGroupByReader,
  userId: number,
  now: Date = new Date(),
): Promise<{ score: number; corroborated: boolean; distinctCodes: number }> {
  const windowStart = new Date(now.getTime() - SCORE_WINDOW_DAYS * 86_400_000);
  const rows = await prisma.antibotEvidence.groupBy({
    by: ["code"],
    where: { userId, createdAt: { gte: windowStart } },
  });
  // Resolve each distinct code's current weight (env-overridable) rather than trusting the
  // historical `weight` column, so re-tuning weights takes effect on recompute.
  const active = rows.map((r) => ({ code: r.code, weight: resolveWeight(r.code).weight }));
  const { score, corroborated } = computeScoreFromActiveCodes(active);
  return { score, corroborated, distinctCodes: active.length };
}

export async function getProfile(prisma: AppPrisma, userId: number) {
  return prisma.antibotProfile.findUnique({ where: { userId } });
}

/**
 * Persist a batch of evidence and update the rolling profile score.
 * Returns the new score (after evidence recompute, clamped).
 */
export async function persistEvidence(
  prisma: AppPrisma,
  input: {
    userId: number;
    sessionId: string;
    eventType: string;
    ip: string | null;
    deviceId: string | null;
    fingerprint: string | null;
    evidence: AntibotEvidence[];
  },
): Promise<{ scoreBefore: number; scoreAfter: number; peak: number }> {
  const now = new Date();
  const profile = await getOrCreateProfile(prisma, input.userId);
  const scoreBefore = profile.riskScore;

  // Whitelisted (admin-reviewed) users are pinned at 0 and never re-scored. This is how a
  // false positive is corrected permanently.
  if (profile.trusted) {
    if (input.evidence.length) {
      const rows = input.evidence.map((e) => evidenceRow(input, e, scoreBefore, 0));
      await prisma.antibotEvidence.createMany({ data: rows });
      await prisma.antibotProfile.update({
        where: { userId: input.userId },
        data: { evidenceCount: { increment: rows.length }, lastEventAt: now, lastComputedAt: now },
      });
    }
    return { scoreBefore: 0, scoreAfter: 0, peak: profile.peakRiskScore };
  }

  // Insert the new evidence FIRST so the windowed recompute sees this beacon's codes, then
  // derive the score from DISTINCT active codes in the window (no per-beacon accumulation).
  // One transaction keeps evidenceCount and the profile consistent.
  const scored = await prisma.$transaction(async (tx) => {
    if (input.evidence.length) {
      const rows = input.evidence.map((e) => evidenceRow(input, e, scoreBefore, scoreBefore));
      await tx.antibotEvidence.createMany({ data: rows });
    }
    const { score } = await computeWindowedScore(tx, input.userId, now);
    const peak = Math.max(profile.peakRiskScore, score);
    await tx.antibotProfile.update({
      where: { userId: input.userId },
      data: {
        riskScore: score,
        trustScore: MAX_SCORE - score,
        peakRiskScore: peak,
        evidenceCount: { increment: input.evidence.length },
        lastEventAt: input.evidence.length ? now : profile.lastEventAt,
        lastComputedAt: now,
      },
    });
    return { score, peak };
  });

  // Backfill the true scoreAfter onto the just-written evidence rows so the audit trail
  // matches the profile (the rows were inserted with a provisional value before recompute).
  if (input.evidence.length && scored.score !== scoreBefore) {
    await prisma.antibotEvidence.updateMany({
      where: { userId: input.userId, sessionId: input.sessionId || null, eventType: input.eventType, createdAt: { gte: now } },
      data: { scoreAfter: scored.score },
    });
  }

  return { scoreBefore, scoreAfter: scored.score, peak: scored.peak };
}

function evidenceRow(
  input: { userId: number; sessionId: string; eventType: string; ip: string | null; deviceId: string | null; fingerprint: string | null },
  e: AntibotEvidence,
  scoreBefore: number,
  scoreAfter: number,
) {
  return {
    userId: input.userId,
    sessionId: input.sessionId || null,
    eventType: input.eventType,
    detector: e.detector,
    code: e.code,
    reason: e.reason,
    weight: e.weight,
    scoreBefore,
    scoreAfter,
    severity: e.severity,
    ip: input.ip,
    deviceId: input.deviceId,
    fingerprint: input.fingerprint,
    metadata: (e.metadata ?? null) as Prisma.InputJsonValue,
  };
}

/** Admin: pin a user as trusted (whitelist) — clears risk and stops future scoring. */
export async function setUserTrusted(prisma: AppPrisma, userId: number, trusted: boolean): Promise<void> {
  await prisma.antibotProfile.upsert({
    where: { userId },
    update: {
      trusted,
      ...(trusted ? { riskScore: 0, trustScore: MAX_SCORE } : {}),
      lastComputedAt: new Date(),
    },
    create: { userId, trusted, ...(trusted ? { riskScore: 0, trustScore: MAX_SCORE } : {}) },
  });
}

export async function setUserTrustedReason(prisma: AppPrisma, userId: number, reason: string | null): Promise<void> {
  await prisma.antibotProfile.update({ where: { userId }, data: { trustedReason: reason } }).catch(() => undefined);
}

/** Admin: recompute a user's score from scratch under the current engine (windowed). */
export async function recomputeUserScore(
  prisma: AppPrisma,
  userId: number,
): Promise<{ score: number; corroborated: boolean; distinctCodes: number }> {
  const now = new Date();
  const result = await computeWindowedScore(prisma, userId, now);
  await prisma.antibotProfile
    .update({
      where: { userId },
      data: { riskScore: result.score, trustScore: MAX_SCORE - result.score, lastComputedAt: now },
    })
    .catch(() => undefined);
  return result;
}

/** Upsert a device identity and return how many distinct accounts use it. */
export async function upsertDevice(
  prisma: AppPrisma,
  data: {
    deviceId: string;
    fingerprint: string | null;
    canvasHash: string | null;
    webglVendor: string | null;
    webglRenderer: string | null;
    platform: string | null;
    language: string | null;
    timezone: string | null;
    screen: string | null;
    userAgent: string | null;
  },
): Promise<{ accountCount: number }> {
  const device = await prisma.antibotDevice.upsert({
    where: { deviceId: data.deviceId },
    update: {
      fingerprint: data.fingerprint ?? undefined,
      canvasHash: data.canvasHash ?? undefined,
      webglVendor: data.webglVendor ?? undefined,
      webglRenderer: data.webglRenderer ?? undefined,
      platform: data.platform ?? undefined,
      language: data.language ?? undefined,
      timezone: data.timezone ?? undefined,
      screen: data.screen ?? undefined,
      userAgent: data.userAgent ?? undefined,
      lastSeenAt: new Date(),
    },
    create: { ...data, firstSeenAt: new Date(), lastSeenAt: new Date() },
    select: { accountCount: true },
  });
  return { accountCount: device.accountCount };
}

/** Recompute distinct-account count for a device from session history. */
export async function recountDeviceAccounts(prisma: AppPrisma, deviceId: string): Promise<number> {
  const groups = await prisma.antibotSession.groupBy({
    by: ["userId"],
    where: { deviceId },
  });
  const count = groups.length;
  await prisma.antibotDevice.update({
    where: { deviceId },
    data: { accountCount: count },
  });
  return count;
}

export interface AlertInput {
  type: string;
  severity: EvidenceSeverity;
  userId?: number | null;
  riskScore?: number;
  deviceId?: string | null;
  ip?: string | null;
  fingerprint?: string | null;
  message: string;
  details?: Record<string, unknown>;
}

/** Create an alert unless an identical open one already exists (dedupe). */
export async function maybeCreateAlert(prisma: AppPrisma, alert: AlertInput): Promise<void> {
  const existing = await prisma.antibotAlert.findFirst({
    where: {
      type: alert.type,
      status: "open",
      ...(alert.deviceId ? { deviceId: alert.deviceId } : {}),
      ...(alert.userId ? { userId: alert.userId } : {}),
    },
    select: { id: true },
  });
  if (existing) return;
  await prisma.antibotAlert.create({
    data: {
      type: alert.type,
      severity: alert.severity,
      status: "open",
      userId: alert.userId ?? null,
      riskScore: alert.riskScore ?? 0,
      deviceId: alert.deviceId ?? null,
      ip: alert.ip ?? null,
      fingerprint: alert.fingerprint ?? null,
      message: alert.message,
      details: (alert.details ?? null) as Prisma.InputJsonValue,
    },
  });
}

/** True when the risk score crossed the alert threshold. */
export function shouldAlertRisk(score: number): boolean {
  return score >= ALERT_RISK_THRESHOLD;
}

/** True when a device is shared by too many accounts. */
export function shouldAlertSharedDevice(accountCount: number): boolean {
  return accountCount >= ALERT_DEVICE_ACCOUNT_THRESHOLD;
}

// ---------------------------------------------------------------------------
// Admin read/write helpers (ported from antibot.controller.ts DB access in legacy)
// ---------------------------------------------------------------------------

export async function adminOverviewData(prisma: AppPrisma, limit: number) {
  const [topRisk, openAlerts, recentAlerts, totals] = await Promise.all([
    prisma.antibotProfile.findMany({
      orderBy: { riskScore: "desc" },
      take: limit,
      select: {
        userId: true,
        riskScore: true,
        trustScore: true,
        peakRiskScore: true,
        evidenceCount: true,
        lastEventAt: true,
        updatedAt: true,
        user: { select: { id: true, username: true, email: true, isBanned: true } },
      },
    }),
    prisma.antibotAlert.count({ where: { status: "open" } }),
    prisma.antibotAlert.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { id: true, username: true, email: true } } },
    }),
    prisma.antibotProfile.aggregate({
      _count: { _all: true },
      _max: { riskScore: true },
      _avg: { riskScore: true },
    }),
  ]);
  return { topRisk, openAlerts, recentAlerts, totals };
}

export async function listEvidencePaginated(
  prisma: AppPrisma,
  filters: { userId?: number; detector?: string; code?: string; severity?: string },
  page: number,
  limit: number,
) {
  const where = {
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.detector ? { detector: filters.detector } : {}),
    ...(filters.code ? { code: filters.code } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.antibotEvidence.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.antibotEvidence.count({ where }),
  ]);
  return { items, total };
}

export async function listSessionsPaginated(
  prisma: AppPrisma,
  filters: { userId?: number; deviceId?: string; ip?: string },
  page: number,
  limit: number,
) {
  const where = {
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.deviceId ? { deviceId: filters.deviceId } : {}),
    ...(filters.ip ? { ip: filters.ip } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.antibotSession.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.antibotSession.count({ where }),
  ]);
  return { items, total };
}

export async function listDevicesPaginated(prisma: AppPrisma, minAccounts: number, page: number, limit: number) {
  const where = minAccounts > 0 ? { accountCount: { gte: minAccounts } } : {};
  const [items, total] = await Promise.all([
    prisma.antibotDevice.findMany({
      where,
      orderBy: { accountCount: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.antibotDevice.count({ where }),
  ]);
  return { items, total };
}

export async function listAlertsPaginated(
  prisma: AppPrisma,
  filters: { status?: string; severity?: string },
  page: number,
  limit: number,
) {
  const where = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.antibotAlert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { id: true, username: true, email: true } } },
    }),
    prisma.antibotAlert.count({ where }),
  ]);
  return { items, total };
}

export async function updateAlertStatus(prisma: AppPrisma, id: number, status: string) {
  const data: Record<string, unknown> = { status };
  if (status === "acknowledged") data.acknowledgedAt = new Date();
  if (status === "resolved") data.resolvedAt = new Date();
  return prisma.antibotAlert.update({ where: { id }, data });
}

export async function getUserFullProfile(prisma: AppPrisma, userId: number, evidenceLimit: number) {
  const [user, profile, evidence, sessions, devices] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, isBanned: true, createdAt: true },
    }),
    prisma.antibotProfile.findUnique({ where: { userId } }),
    prisma.antibotEvidence.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: evidenceLimit,
    }),
    prisma.antibotSession.findMany({
      where: { userId },
      orderBy: { lastSeenAt: "desc" },
      take: 50,
    }),
    prisma.antibotSession.findMany({
      where: { userId },
      distinct: ["deviceId"],
      orderBy: { lastSeenAt: "desc" },
      take: 30,
      select: { deviceId: true, fingerprint: true, browser: true, os: true, lastSeenAt: true },
    }),
  ]);
  return { user, profile, evidence, sessions, devices };
}

/**
 * Wipe all antibot telemetry (evidence, alerts, sessions, devices) and reset every profile to
 * 0. Keeps the `trusted` whitelist flags.
 */
export async function clearAllAntibotData(prisma: AppPrisma): Promise<number> {
  const before = await prisma.antibotEvidence.count();
  await prisma.$transaction([
    prisma.antibotEvidence.deleteMany({}),
    prisma.antibotAlert.deleteMany({}),
    prisma.antibotSession.deleteMany({}),
    prisma.antibotDevice.deleteMany({}),
    prisma.antibotProfile.updateMany({
      data: {
        riskScore: 0,
        peakRiskScore: 0,
        evidenceCount: 0,
        trustScore: 100,
        lastEventAt: null,
        lastComputedAt: new Date(),
      },
    }),
  ]);
  return before;
}

// ---------------------------------------------------------------------------
// Legacy reduced-scope generic-evidence helpers (kept for backward compatibility with the
// original scope-reduced `POST /telemetry` write path used by non-detector callers/tests).
// ---------------------------------------------------------------------------

/**
 * `AntibotEvidence.userId` is a required (non-nullable) Int in schema.prisma. Anonymous
 * telemetry (no logged-in user) therefore CANNOT be persisted into this table without a
 * schema change — which is out of scope here (no migrations invented). Anonymous hits are
 * dropped after this check; the caller still responds 200 per the legacy contract.
 */
export async function insertTelemetryEvidence(prisma: AppPrisma, input: CollectTelemetryInput): Promise<boolean> {
  if (input.userId == null) return false;
  await prisma.antibotEvidence.create({
    data: {
      userId: input.userId,
      sessionId: input.sessionId,
      eventType: input.eventType,
      detector: "telemetry",
      code: "raw_telemetry",
      reason: "Raw telemetry collected.",
      weight: 0,
      scoreBefore: 0,
      scoreAfter: 0,
      severity: "info",
      ip: input.ip || null,
      metadata: { telemetry: input.telemetry, userAgent: input.userAgent } as object,
    },
  });
  return true;
}

export async function listRecentEvidence(prisma: AppPrisma, limit: number) {
  return prisma.antibotEvidence.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      userId: true,
      sessionId: true,
      eventType: true,
      ip: true,
      metadata: true,
      createdAt: true,
    },
  });
}

export async function countEvidence(prisma: AppPrisma): Promise<number> {
  return prisma.antibotEvidence.count();
}

export async function countDistinctUsersWithEvidence(prisma: AppPrisma): Promise<number> {
  const rows = await prisma.antibotEvidence.findMany({
    distinct: ["userId"],
    select: { userId: true },
  });
  return rows.length;
}
