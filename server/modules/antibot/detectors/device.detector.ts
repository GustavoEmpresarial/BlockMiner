/**
 * Port of legacy/server/modules/antibot/detectors/device.detector.ts.
 *
 * DeviceDetector — upserts the stable device identity and emits evidence when the same
 * physical device is operated by many accounts (multi-accounting).
 */
import type { AntibotDetector, AntibotEvidence, DetectorContext } from "../antibot.types.js";
import { resolveWeight } from "../antibot.weights.js";
import { recountDeviceAccounts, upsertDevice } from "../antibot.repository.js";

export const deviceDetector: AntibotDetector = {
  name: "device",
  async detect(ctx: DetectorContext): Promise<AntibotEvidence[]> {
    const out: AntibotEvidence[] = [];
    const dev = ctx.telemetry.device ?? {};
    const env = ctx.telemetry.environment ?? {};
    const deviceId = dev.deviceId ?? null;
    if (!deviceId) return out;

    await upsertDevice(ctx.prisma, {
      deviceId,
      fingerprint: dev.fingerprint ?? null,
      canvasHash: dev.canvasHash ?? null,
      webglVendor: dev.webglVendor ?? null,
      webglRenderer: dev.webglRenderer ?? null,
      platform: env.platform ?? null,
      language: env.language ?? null,
      timezone: env.timezone ?? null,
      screen: env.screenResolution ?? null,
      userAgent: ctx.userAgent || null,
    });

    // Recompute distinct account count for this device from session history.
    const accountCount = await recountDeviceAccounts(ctx.prisma, deviceId);

    if (accountCount >= 3) {
      out.push({
        detector: "device",
        code: "shared_device_many_accounts",
        ...resolveWeight("shared_device_many_accounts"),
        metadata: { deviceId, accountCount },
      });
    }
    return out;
  },
};
