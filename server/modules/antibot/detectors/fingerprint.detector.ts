/**
 * Port of legacy/server/modules/antibot/detectors/fingerprint.detector.ts.
 *
 * FingerprintDetector — flags inconsistent fingerprint/device churn. A legitimate user keeps
 * a stable fingerprint across sessions. Frequent changes (device id, fingerprint, locale,
 * location) raise the score.
 */
import type { AntibotDetector, AntibotEvidence, DetectorContext } from "../antibot.types.js";
import { resolveWeight } from "../antibot.weights.js";
import { isInfrastructureIp } from "../../ip-intelligence/index.js";

const CHURN_WINDOW_HOURS = 24;
const FINGERPRINT_CHURN_THRESHOLD = 3;
const LOCATION_JUMP_MINUTES = 60; // implausibly fast geo move

export const fingerprintDetector: AntibotDetector = {
  name: "fingerprint",
  async detect(ctx: DetectorContext): Promise<AntibotEvidence[]> {
    const out: AntibotEvidence[] = [];
    if (ctx.userId == null) return out;

    const dev = ctx.telemetry.device ?? {};
    const fingerprint = dev.fingerprint ?? null;
    const deviceId = dev.deviceId ?? null;
    if (!fingerprint && !deviceId) return out;

    const since = new Date(Date.now() - CHURN_WINDOW_HOURS * 3_600_000);
    const recent = await ctx.prisma.antibotSession.findMany({
      where: { userId: ctx.userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { fingerprint: true, deviceId: true, language: true, timezone: true, ip: true, createdAt: true },
    });

    // Fingerprint churn
    const distinctFp = new Set(recent.map((r) => r.fingerprint).filter(Boolean));
    if (fingerprint) distinctFp.add(fingerprint);
    if (distinctFp.size >= FINGERPRINT_CHURN_THRESHOLD) {
      out.push({
        detector: "fingerprint",
        code: "fingerprint_churn",
        ...resolveWeight("fingerprint_churn"),
        metadata: { distinctFingerprints: distinctFp.size, windowHours: CHURN_WINDOW_HOURS },
      });
    }

    // Device churn
    const distinctDevices = new Set(recent.map((r) => r.deviceId).filter(Boolean));
    if (deviceId) distinctDevices.add(deviceId);
    if (distinctDevices.size >= FINGERPRINT_CHURN_THRESHOLD) {
      out.push({
        detector: "fingerprint",
        code: "device_churn",
        ...resolveWeight("device_churn"),
        metadata: { distinctDevices: distinctDevices.size, windowHours: CHURN_WINDOW_HOURS },
      });
    }

    // Locale churn (language + timezone)
    const locales = new Set(recent.map((r) => `${r.language ?? "?"}|${r.timezone ?? "?"}`));
    const env = ctx.telemetry.environment ?? {};
    locales.add(`${env.language ?? "?"}|${env.timezone ?? "?"}`);
    if (locales.size >= FINGERPRINT_CHURN_THRESHOLD) {
      out.push({
        detector: "fingerprint",
        code: "locale_churn",
        ...resolveWeight("locale_churn"),
        metadata: { distinctLocales: locales.size },
      });
    }

    // Abrupt location jump: same user, different IP within a short window.
    // Ignore infrastructure/private IPs (Docker bridge 172.x, 10.x, 192.168.x, loopback): the app
    // sits behind nginx, so an internal hop is NOT a user relocating and must not score.
    if (ctx.ip && !isInfrastructureIp(ctx.ip) && recent.length) {
      const last = recent[0];
      if (last?.ip && !isInfrastructureIp(last.ip) && last.ip !== ctx.ip) {
        const elapsedMin = (Date.now() - new Date(last.createdAt).getTime()) / 60_000;
        if (elapsedMin > 0 && elapsedMin < LOCATION_JUMP_MINUTES) {
          out.push({
            detector: "fingerprint",
            code: "location_jump",
            ...resolveWeight("location_jump"),
            metadata: {
              previousIp: last.ip,
              currentIp: ctx.ip,
              elapsedMinutes: Math.round(elapsedMin),
            },
          });
        }
      }
    }

    return out;
  },
};
