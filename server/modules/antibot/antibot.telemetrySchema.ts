/**
 * Port of legacy/server/modules/antibot/domain/telemetrySchema.ts.
 *
 * The collector endpoint used to raw-cast `req.body` into evidence. That let a malformed or
 * hostile body inject arbitrary values into the risk pipeline. This keeps ONLY the known
 * fields, coerced to the right primitive type and bounded in size. Anything unknown/oversized
 * is dropped, never trusted.
 */
import type { AntibotTelemetry } from "./antibot.types.js";

function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}
function asStr(v: unknown, max = 200): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  return v.slice(0, max);
}
function asNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function asStrArr(v: unknown, maxItems = 20, maxLen = 40): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((x) => typeof x === "string").slice(0, maxItems).map((x) => (x as string).slice(0, maxLen));
}
function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Full, field-by-field telemetry sanitizer used by the risk engine (replaces the previous
 * bounded-generic sanitizer for the actual detector pipeline). */
export function sanitizeAntibotTelemetry(raw: unknown): AntibotTelemetry {
  const t = rec(raw);
  const b = rec(t.browser);
  const e = rec(t.environment);
  const d = rec(t.device);
  const beh = rec(t.behavior);
  const integ = rec(t.integrity);

  return {
    browser: {
      webdriver: asBool(b.webdriver),
      headless: asBool(b.headless),
      selenium: asBool(b.selenium),
      puppeteer: asBool(b.puppeteer),
      playwright: asBool(b.playwright),
      phantomjs: asBool(b.phantomjs),
      electron: asBool(b.electron),
      automationApi: asBool(b.automationApi),
      userAgent: asStr(b.userAgent, 400),
      knownAutomationUA: asBool(b.knownAutomationUA),
      inconsistentUA: asBool(b.inconsistentUA),
      languages: asStrArr(b.languages),
    },
    environment: {
      language: asStr(e.language, 40),
      languages: asStrArr(e.languages),
      timezone: asStr(e.timezone, 60),
      timezoneOffset: asNum(e.timezoneOffset),
      screenResolution: asStr(e.screenResolution, 40),
      colorDepth: asNum(e.colorDepth),
      hardwareConcurrency: asNum(e.hardwareConcurrency),
      deviceMemory: asNum(e.deviceMemory),
      platform: asStr(e.platform, 60),
      touchSupport: asBool(e.touchSupport),
      cookiesEnabled: asBool(e.cookiesEnabled),
      localStorage: asBool(e.localStorage),
      sessionStorage: asBool(e.sessionStorage),
      vendor: asStr(e.vendor, 80),
      plugins: asNum(e.plugins),
      mismatchedTimezone: asBool(e.mismatchedTimezone),
    },
    device: {
      deviceId: asStr(d.deviceId, 128),
      fingerprint: asStr(d.fingerprint, 128),
      canvasHash: asStr(d.canvasHash, 128),
      webglVendor: asStr(d.webglVendor, 128),
      webglRenderer: asStr(d.webglRenderer, 256),
      fontCount: asNum(d.fontCount),
    },
    behavior: {
      navigationEvents: asNum(beh.navigationEvents),
      avgActionIntervalMs: asNum(beh.avgActionIntervalMs),
      intervalVarianceMs: asNum(beh.intervalVarianceMs),
      intervalCv: asNum(beh.intervalCv),
      clickDistribution: asNum(beh.clickDistribution),
      sessionDurationMs: asNum(beh.sessionDurationMs),
      repetitiveSequences: asNum(beh.repetitiveSequences),
      impossibleSpeed: asBool(beh.impossibleSpeed),
      humanLikeInput: asBool(beh.humanLikeInput),
      path: asStrArr(beh.path, 50, 120),
    },
    integrity: {
      overriddenApiCount: asNum(integ.overriddenApiCount),
      overriddenApis: asStrArr(integ.overriddenApis),
      navTampered: asBool(integ.navTampered),
      noPermissions: asBool(integ.noPermissions),
      noChromeRuntime: asBool(integ.noChromeRuntime),
      userscriptHint: asBool(integ.userscriptHint),
      extensionScriptHint: asBool(integ.extensionScriptHint),
      userscriptNetworkStack: asBool(integ.userscriptNetworkStack),
      injectedInlineScript: asBool(integ.injectedInlineScript),
      consoleTampered: asBool(integ.consoleTampered),
      hookBypass: asBool(integ.hookBypass),
      userscriptManagerInstalled: asBool(integ.userscriptManagerInstalled),
      userscriptManagers: asStrArr(integ.userscriptManagers),
    },
  };
}
