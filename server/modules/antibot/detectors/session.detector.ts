/**
 * Session snapshot writer (not a scoring detector).
 * Upserts antibot_sessions so fingerprint/relationship detectors can query churn / shared IPs.
 * Intentionally returns no evidence codes.
 */
import type { AntibotDetector, AntibotEvidence, DetectorContext } from "../antibot.types.js";

export const sessionDetector: AntibotDetector = {
  name: "session",
  async detect(ctx: DetectorContext): Promise<AntibotEvidence[]> {
    if (ctx.userId == null) return [];
    const env = ctx.telemetry.environment ?? {};
    const dev = ctx.telemetry.device ?? {};

    // Parse browser/OS from user agent (lightweight, best-effort).
    const ua = ctx.userAgent || "";
    const browser = detectBrowser(ua) || env.vendor || null;
    const os = detectOS(ua) || env.platform || null;

    await ctx.prisma.antibotSession.upsert({
      where: { userId_sessionId: { userId: ctx.userId, sessionId: ctx.sessionId } },
      update: {
        ip: ctx.ip,
        browser,
        os,
        platform: env.platform ?? null,
        deviceId: dev.deviceId ?? null,
        fingerprint: dev.fingerprint ?? null,
        userAgent: ua || null,
        language: env.language ?? null,
        timezone: env.timezone ?? null,
        lastSeenAt: new Date(),
      },
      create: {
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        ip: ctx.ip,
        browser,
        os,
        platform: env.platform ?? null,
        deviceId: dev.deviceId ?? null,
        fingerprint: dev.fingerprint ?? null,
        userAgent: ua || null,
        language: env.language ?? null,
        timezone: env.timezone ?? null,
      },
    });

    return [];
  },
};

function detectBrowser(ua: string): string | null {
  if (!ua) return null;
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/chrome\//i.test(ua)) return "Chrome";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/safari\//i.test(ua)) return "Safari";
  return null;
}

function detectOS(ua: string): string | null {
  if (!ua) return null;
  if (/windows nt/i.test(ua)) return "Windows";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ios/i.test(ua)) return "iOS";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  if (/linux/i.test(ua)) return "Linux";
  return null;
}
