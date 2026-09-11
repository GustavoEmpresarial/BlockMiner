/**
 * Fire-and-forget integrity beacons → POST /api/antibot/telemetry.
 * eventType must start with site:integrity so the server allowlist accepts it.
 */
import { api } from "../../../shared/auth/auth.store";
import { generateSecurityPayload, isAutomationDetected } from "../../../shared/utils/security";
import { maybeKickFromIntegrityManagers } from "./integrity.enforce";
import { getIntegrityHookFlags, installIntegrityHooks, stopIntegrityHooks } from "./integrity.hooks";
import {
  integritySeverity,
  runIntegrityProbe,
  SITE_INTEGRITY_MIN_REPORT_GAP_MS,
  SITE_INTEGRITY_PROBE_INTERVAL_MS,
  type IntegrityProbeResult,
} from "./integrity.probe";
import { hasBlockedUserscriptManager } from "./integrity.policy";

export type IntegrityReportReason = "boot" | "interval" | "focus" | "critical-action" | "hot";

const pageSessionId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `site-integrity-${crypto.randomUUID()}`
    : `site-integrity-${Date.now()}`;

let lastReportAt = 0;
let lastSeverity = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let started = false;

function integrityPayload(probe: IntegrityProbeResult) {
  return {
    overriddenApiCount: probe.overriddenApiCount,
    overriddenApis: probe.overriddenApis.slice(0, 20),
    navTampered: probe.navTampered,
    noPermissions: probe.noPermissions,
    noChromeRuntime: probe.noChromeRuntime,
    userscriptHint: probe.userscriptHint,
    extensionScriptHint: probe.extensionScriptHint,
    userscriptNetworkStack: probe.userscriptNetworkStack,
    injectedInlineScript: probe.injectedInlineScript,
    consoleTampered: probe.consoleTampered,
    hookBypass: probe.hookBypass,
    userscriptManagerInstalled: probe.userscriptManagerInstalled,
    userscriptManagers: probe.userscriptManagers.slice(0, 10),
  };
}

function buildBody(probe: IntegrityProbeResult, reason: IntegrityReportReason) {
  const security = generateSecurityPayload();
  const webdriver =
    typeof navigator !== "undefined" &&
    Boolean((navigator as Navigator & { webdriver?: boolean }).webdriver);
  return {
    eventType: `site:integrity:${reason}`.slice(0, 40),
    sessionId: pageSessionId.slice(0, 80),
    telemetry: {
      browser: {
        webdriver: webdriver || isAutomationDetected(),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      },
      environment: {
        language: typeof navigator !== "undefined" ? navigator.language : undefined,
        timezone:
          typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined,
        hardwareConcurrency: typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined,
        platform: typeof navigator !== "undefined" ? navigator.platform : undefined,
        touchSupport: typeof navigator !== "undefined" ? navigator.maxTouchPoints > 0 : undefined,
        plugins:
          typeof navigator !== "undefined" && Array.isArray(navigator.plugins)
            ? navigator.plugins.length
            : undefined,
      },
      device: {
        fingerprint: security.fingerprint.slice(0, 128),
      },
      behavior: {
        humanLikeInput: !isAutomationDetected(),
        impossibleSpeed: false,
      },
      integrity: integrityPayload(probe),
    },
  };
}

function currentProbe(): IntegrityProbeResult {
  return runIntegrityProbe(getIntegrityHookFlags());
}

/** Returns true if a report was queued. Never throws. */
export function reportSiteIntegrity(reason: IntegrityReportReason = "interval"): boolean {
  try {
    const probe = currentProbe();
    if (
      hasBlockedUserscriptManager(probe.userscriptManagers) ||
      probe.userscriptHint
    ) {
      maybeKickFromIntegrityManagers(
        hasBlockedUserscriptManager(probe.userscriptManagers)
          ? probe.userscriptManagers
          : ["tampermonkey"],
      );
    }
    const sev = integritySeverity(probe);
    const now = Date.now();
    const gapOk = now - lastReportAt >= SITE_INTEGRITY_MIN_REPORT_GAP_MS;
    const severityRose = sev > lastSeverity;
    const urgent = reason === "boot" || reason === "critical-action" || reason === "hot";
    if (!gapOk && !severityRose && !urgent) return false;
    if (urgent && !gapOk && !severityRose && lastReportAt > 0 && reason !== "hot") return false;
    // hot always reports when severity rose; if first hot with same sev still allow once per gap
    if (reason === "hot" && !severityRose && !gapOk) return false;
    lastReportAt = now;
    lastSeverity = Math.max(lastSeverity, sev);
    void api.post("/antibot/telemetry", buildBody(probe, reason)).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

function onVisibility(): void {
  if (typeof document !== "undefined" && document.visibilityState === "visible") {
    reportSiteIntegrity("focus");
  }
}

/** Start hooks + periodic probes while the user session is live. Idempotent. */
export function startSiteIntegrityMonitoring(): () => void {
  if (started || typeof window === "undefined") return () => undefined;
  started = true;
  installIntegrityHooks(() => {
    reportSiteIntegrity("hot");
  });
  reportSiteIntegrity("boot");
  timer = setInterval(() => reportSiteIntegrity("interval"), SITE_INTEGRITY_PROBE_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    started = false;
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener("visibilitychange", onVisibility);
    stopIntegrityHooks();
  };
}

export function getLastIntegrityProbe(): IntegrityProbeResult {
  return currentProbe();
}
