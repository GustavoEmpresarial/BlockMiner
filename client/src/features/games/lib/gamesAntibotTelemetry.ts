/**
 * Fire-and-forget antibot telemetry for mini-games.
 * eventType MUST start with "game" so ANTIBOT allowlist accepts it.
 */
import { api } from "../../../shared/auth/auth.store";
import { generateSecurityPayload, isAutomationDetected } from "../../../shared/utils/security";
import { getIntegrityHookFlags, runIntegrityProbe } from "../../antibot";

export type GameTelemetryPhase = "start" | "action" | "end" | "claim";

function buildTelemetryBody(slug: string, phase: GameTelemetryPhase, extra?: Record<string, unknown>) {
  const security = generateSecurityPayload();
  const integrity = runIntegrityProbe(getIntegrityHookFlags());
  const webdriver =
    typeof navigator !== "undefined" && Boolean((navigator as Navigator & { webdriver?: boolean }).webdriver);
  return {
    eventType: `game:${slug}:${phase}`.slice(0, 40),
    sessionId: `game-${slug}-${phase}-${Date.now()}`.slice(0, 80),
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
      },
      device: {
        fingerprint: security.fingerprint.slice(0, 128),
      },
      behavior: {
        sessionDurationMs: typeof extra?.sessionDurationMs === "number" ? extra.sessionDurationMs : undefined,
        humanLikeInput: !isAutomationDetected(),
        impossibleSpeed: false,
      },
      integrity: {
        overriddenApiCount: integrity.overriddenApiCount,
        overriddenApis: integrity.overriddenApis.slice(0, 20),
        navTampered: integrity.navTampered,
        noPermissions: integrity.noPermissions,
        noChromeRuntime: integrity.noChromeRuntime,
        userscriptHint: integrity.userscriptHint,
        extensionScriptHint: integrity.extensionScriptHint,
        userscriptNetworkStack: integrity.userscriptNetworkStack,
        injectedInlineScript: integrity.injectedInlineScript,
        consoleTampered: integrity.consoleTampered,
        hookBypass: integrity.hookBypass,
        userscriptManagerInstalled: integrity.userscriptManagerInstalled,
        userscriptManagers: integrity.userscriptManagers.slice(0, 10),
      },
      ...extra,
    },
  };
}

/** Never throws — antibot collector is best-effort. */
export function postGameAntibotTelemetry(
  slug: string,
  phase: GameTelemetryPhase,
  extra?: Record<string, unknown>,
): void {
  if (!slug) return;
  const body = buildTelemetryBody(slug, phase, extra);
  void api.post("/antibot/telemetry", body).catch(() => undefined);
}

export function gameStartAntibotPayload(
  slug: string,
  opts?: { cfTurnstileToken?: string },
): {
  slug: string;
  antibot: { webdriver: boolean; isBot: boolean };
  cfTurnstileToken?: string;
} {
  const webdriver =
    typeof navigator !== "undefined" && Boolean((navigator as Navigator & { webdriver?: boolean }).webdriver);
  const token = String(opts?.cfTurnstileToken || "").trim();
  return {
    slug,
    antibot: {
      webdriver,
      isBot: isAutomationDetected() || webdriver,
    },
    ...(token ? { cfTurnstileToken: token } : {}),
  };
}
