/**
 * Standalone IIFE entry — bundled to client/dist/assets/site-integrity-v1.js
 * so probes run without waiting on a full Vite SPA rebuild.
 * Source of truth: client/src/features/antibot/integrity/
 */
import { maybeKickFromIntegrityManagers } from "./integrity.enforce";
import { getIntegrityHookFlags, installIntegrityHooks } from "./integrity.hooks";
import { hasBlockedUserscriptManager } from "./integrity.policy";
import {
  integritySeverity,
  runIntegrityProbe,
  SITE_INTEGRITY_MIN_REPORT_GAP_MS,
  SITE_INTEGRITY_PROBE_INTERVAL_MS,
} from "./integrity.probe";

const sessionId =
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `site-integrity-${crypto.randomUUID()}`
    : `site-integrity-${Date.now()}`;

let lastAt = 0;
let lastSev = 0;

function integrityFields() {
  const probe = runIntegrityProbe(getIntegrityHookFlags());
  return {
    probe,
    fields: {
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
    },
  };
}

function post(reason: string): void {
  try {
    const { probe, fields } = integrityFields();
    if (hasBlockedUserscriptManager(probe.userscriptManagers)) {
      maybeKickFromIntegrityManagers(probe.userscriptManagers);
    }
    const sev = integritySeverity(probe);
    const now = Date.now();
    const urgent = reason === "boot" || reason === "hot";
    if (now - lastAt < SITE_INTEGRITY_MIN_REPORT_GAP_MS && sev <= lastSev && !urgent) {
      return;
    }
    if (reason === "hot" && sev <= lastSev && now - lastAt < SITE_INTEGRITY_MIN_REPORT_GAP_MS) {
      return;
    }
    lastAt = now;
    lastSev = Math.max(lastSev, sev);
    const body = {
      eventType: `site:integrity:${reason}`.slice(0, 40),
      sessionId: sessionId.slice(0, 80),
      telemetry: {
        browser: {
          webdriver: Boolean((navigator as Navigator & { webdriver?: boolean }).webdriver),
          userAgent: navigator.userAgent,
        },
        environment: {
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          hardwareConcurrency: navigator.hardwareConcurrency,
          platform: navigator.platform,
          plugins: navigator.plugins?.length,
        },
        device: {},
        behavior: { humanLikeInput: true, impossibleSpeed: false },
        integrity: fields,
      },
    };
    void fetch("/api/antibot/telemetry", {
      method: "POST",
      credentials: "include",
      headers: (() => {
        const h: Record<string, string> = { "Content-Type": "application/json" };
        try {
          const m = document.cookie.match(/(?:^|; )blockminer_csrf=([^;]*)/);
          if (m?.[1]) h["x-csrf-token"] = decodeURIComponent(m[1]);
        } catch {
          /* ignore */
        }
        return h;
      })(),
      body: JSON.stringify(body),
    }).catch(() => undefined);
  } catch {
    /* never break the page */
  }
}

function boot(): void {
  installIntegrityHooks(() => post("hot"));
  post("boot");
  setInterval(() => post("interval"), SITE_INTEGRITY_PROBE_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") post("focus");
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}
