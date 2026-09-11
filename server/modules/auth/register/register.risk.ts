/**
 * Registration cooldown/risk scoring — faithful port of
 * legacy/server/services/authNetworkSignalService.ts's device-fingerprint +
 * IP/network reuse heuristics (`evaluateRegistrationAttempt`), scoped to
 * register/ since it is register-only glue. Reuses the ip-intelligence module
 * boundary (normalizeIp / deriveDefaultNetworkCidr / getCachedIpIntelligence)
 * instead of duplicating IP-parsing logic.
 */
import crypto from "node:crypto";
import type { Request } from "express";
import type { TxClient, AppPrisma } from "../../../core/database/prisma.js";
import { normalizeIp, deriveDefaultNetworkCidr } from "../../ip-intelligence/index.js";

const UNKNOWN_FINGERPRINT = "unknown";
const HIGH_RISK_PROVIDER_TYPES = new Set(["hosting", "vpn_proxy", "tor"]);

type AnyPrisma = AppPrisma | TxClient;

export type AuthIpContext = {
  normalizedIp: string | null;
  networkCidr: string | null;
  asn: number | null;
  providerType: string;
};

function decodeBase64Json(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(String(raw), "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeScreen(screen: unknown): { width: number; height: number; dpr: number; colorDepth: number | null } | null {
  if (!screen || typeof screen !== "object") return null;
  const s = screen as Record<string, unknown>;
  const width = Number(s.width || 0);
  const height = Number(s.height || 0);
  const dpr = Number(s.dpr || 0);
  const colorDepth = Number(s.colorDepth || 0);
  if (!width || !height) return null;
  return {
    width,
    height,
    dpr: Number.isFinite(dpr) && dpr > 0 ? dpr : 1,
    colorDepth: Number.isFinite(colorDepth) && colorDepth > 0 ? colorDepth : null,
  };
}

function normalizeDeviceSignals(payload: Record<string, unknown> | null) {
  if (!payload) return null;
  const screen = normalizeScreen(payload.s);
  const timezone = typeof payload.tz === "string" ? payload.tz.trim().slice(0, 64) : null;
  const language = typeof payload.l === "string" ? payload.l.trim().slice(0, 32) : null;
  const platform = typeof payload.p === "string" ? payload.p.trim().slice(0, 64) : null;
  const hardwareConcurrency = Number(payload.hc || 0);
  const deviceMemory = Number(payload.dm || 0);
  const touchPoints = Number(payload.tp || 0);
  const bot = payload.b ? 1 : 0;

  const hasUsefulSignal =
    Boolean(screen) ||
    Boolean(timezone) ||
    Boolean(language) ||
    Boolean(platform) ||
    (Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0) ||
    (Number.isFinite(deviceMemory) && deviceMemory > 0) ||
    (Number.isFinite(touchPoints) && touchPoints > 0);
  if (!hasUsefulSignal) return null;

  return {
    screen,
    timezone,
    language,
    platform,
    hardwareConcurrency: Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0 ? hardwareConcurrency : null,
    deviceMemory: Number.isFinite(deviceMemory) && deviceMemory > 0 ? deviceMemory : null,
    touchPoints: Number.isFinite(touchPoints) && touchPoints >= 0 ? touchPoints : null,
    bot,
    version: typeof payload.v === "string" ? payload.v.slice(0, 16) : null,
  };
}

/** Extracts the anti-bot device-fingerprint payload from headers or body, if present. */
export function extractSecurityPayload(req: Request): Record<string, unknown> | null {
  const headerPayload = decodeBase64Json(req.headers?.["x-anti-bot-payload"]);
  if (headerPayload) return headerPayload;
  const body = req.body as { security?: { fingerprint?: unknown } } | undefined;
  return decodeBase64Json(body?.security?.fingerprint);
}

/** Builds a stable sha256 device fingerprint from the anti-bot payload, or "unknown". */
export function buildDeviceFingerprint(req: Request): string {
  const payload = extractSecurityPayload(req);
  const normalized = normalizeDeviceSignals(payload);
  if (!normalized) return UNKNOWN_FINGERPRINT;
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

/** Best-effort IP context (network CIDR / ASN / provider type) from the ip-intelligence cache. */
export async function getAuthIpContext(prisma: AnyPrisma, ipInput: unknown): Promise<AuthIpContext> {
  const ip = normalizeIp(ipInput);
  if (!ip) {
    return { normalizedIp: null, networkCidr: null, asn: null, providerType: "unknown" };
  }
  const client = prisma as unknown as { ipIntelligenceCache?: { findUnique: (args: unknown) => Promise<unknown> } };
  if (!client.ipIntelligenceCache?.findUnique) {
    return { normalizedIp: ip, networkCidr: deriveDefaultNetworkCidr(ip), asn: null, providerType: "unknown" };
  }
  const row = (await client.ipIntelligenceCache
    .findUnique({ where: { ip } })
    .catch(() => null)) as { networkCidr?: string | null; asn?: number | null; providerType?: string | null } | null;
  return {
    normalizedIp: ip,
    networkCidr: row?.networkCidr || deriveDefaultNetworkCidr(ip),
    asn: Number.isInteger(row?.asn) ? (row!.asn as number) : null,
    providerType: String(row?.providerType || "unknown"),
  };
}

export type RecordUserIpLogInput = {
  userId: number;
  ip: unknown;
  networkCidr?: string | null;
  asn?: number | null;
  providerType?: string | null;
  deviceFingerprint?: string | null;
  userAgent?: string | null;
  eventType: "login" | "register";
  now?: Date;
};

/** Upserts the per-user/ip/device row tracking login and registration counts. */
export async function recordUserIpLog(prismaOrTx: AnyPrisma, input: RecordUserIpLogInput) {
  const normalizedIp = normalizeIp(input.ip);
  if (!input.userId || !normalizedIp) return null;
  const fingerprint = String(input.deviceFingerprint || UNKNOWN_FINGERPRINT).slice(0, 128) || UNKNOWN_FINGERPRINT;
  const isRegister = input.eventType === "register";
  const isLogin = input.eventType === "login";
  const now = input.now ?? new Date();
  return prismaOrTx.userIpLog.upsert({
    where: {
      userId_ip_deviceFingerprint: {
        userId: Number(input.userId),
        ip: normalizedIp,
        deviceFingerprint: fingerprint,
      },
    },
    create: {
      userId: Number(input.userId),
      ip: normalizedIp,
      deviceFingerprint: fingerprint,
      networkCidr: input.networkCidr || null,
      asn: Number.isInteger(input.asn) ? (input.asn as number) : null,
      providerType: String(input.providerType || "unknown"),
      firstSeen: now,
      lastSeen: now,
      loginCount: isLogin ? 1 : 0,
      registerCount: isRegister ? 1 : 0,
      lastUserAgent: input.userAgent ? String(input.userAgent).slice(0, 512) : null,
    },
    update: {
      lastSeen: now,
      networkCidr: input.networkCidr || null,
      asn: Number.isInteger(input.asn) ? (input.asn as number) : null,
      providerType: String(input.providerType || "unknown"),
      lastUserAgent: input.userAgent ? String(input.userAgent).slice(0, 512) : null,
      ...(isLogin ? { loginCount: { increment: 1 } } : {}),
      ...(isRegister ? { registerCount: { increment: 1 } } : {}),
    },
  });
}

export type RegistrationAttemptEvaluation = {
  allowed: boolean;
  score: number;
  reasons: string[];
  cooldownMinutes: number;
  providerType: string;
  recentExactIp: number;
  recentFingerprint: number;
  recentNetwork: number;
};

/**
 * Scores a registration attempt for abuse (same device/IP/network creating many
 * accounts in a short window). Mirrors legacy thresholds exactly: score >= 70
 * blocks with a 15-minute cooldown.
 */
export async function evaluateRegistrationAttempt(
  prisma: AnyPrisma,
  params: { ip: unknown; networkCidr?: string | null; providerType?: string | null; deviceFingerprint?: string | null; now?: Date },
): Promise<RegistrationAttemptEvaluation> {
  const normalizedIp = normalizeIp(params.ip);
  if (!normalizedIp) {
    return { allowed: true, score: 0, reasons: [], cooldownMinutes: 0, providerType: "unknown", recentExactIp: 0, recentFingerprint: 0, recentNetwork: 0 };
  }

  const now = params.now ?? new Date();
  const exactWindowStart = new Date(now.getTime() - 15 * 60 * 1000);
  const fingerprintWindowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const networkWindowStart = new Date(now.getTime() - 15 * 60 * 1000);

  const normalizedFingerprint = String(params.deviceFingerprint || UNKNOWN_FINGERPRINT);
  const networkCidr = params.networkCidr || null;

  const [recentExactIp, recentFingerprint, recentNetwork] = await Promise.all([
    prisma.userIpLog.count({
      where: { ip: normalizedIp, registerCount: { gt: 0 }, lastSeen: { gte: exactWindowStart } },
    }),
    normalizedFingerprint !== UNKNOWN_FINGERPRINT
      ? prisma.userIpLog.count({
          where: { deviceFingerprint: normalizedFingerprint, registerCount: { gt: 0 }, lastSeen: { gte: fingerprintWindowStart } },
        })
      : Promise.resolve(0),
    networkCidr
      ? prisma.userIpLog.count({
          where: { networkCidr, registerCount: { gt: 0 }, lastSeen: { gte: networkWindowStart } },
        })
      : Promise.resolve(0),
  ]);

  const reasons: string[] = [];
  let score = 0;

  if (recentFingerprint >= 2) {
    score += 85;
    reasons.push("Same device fingerprint already created multiple recent accounts.");
  }

  const providerType = String(params.providerType || "unknown");
  if (HIGH_RISK_PROVIDER_TYPES.has(providerType) && recentExactIp >= 1) {
    score += 70;
    reasons.push("Hosting/VPN IP already used for a recent registration.");
  } else if (recentExactIp >= 4) {
    score += 65;
    reasons.push("Too many recent registrations from the same exact IP.");
  }

  if (networkCidr && recentNetwork >= 6) {
    score += 30;
    reasons.push("Too many recent registrations from the same IPv6 /64 network.");
  }

  return {
    allowed: score < 70,
    score: Math.min(100, score),
    reasons,
    cooldownMinutes: score >= 70 ? 15 : 0,
    providerType,
    recentExactIp,
    recentFingerprint,
    recentNetwork,
  };
}
