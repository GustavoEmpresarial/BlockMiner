/**
 * Port of legacy/server/modules/antibot/detectors/browserIntegrity.detector.ts.
 *
 * BrowserIntegrityDetector — flags native API tampering, Proxy objects, and missing browser
 * subsystems that legitimate browsers always expose. Automation frameworks (Puppeteer,
 * Playwright, Selenium) often patch native functions (e.g. navigator.webdriver,
 * Function.prototype.toString) or leave Chrome-only globals absent. These are strong
 * corroborating signals.
 */
import type { AntibotDetector, AntibotEvidence, DetectorContext } from "../antibot.types.js";
import { resolveWeight } from "../antibot.weights.js";

export const browserIntegrityDetector: AntibotDetector = {
  name: "browser_integrity",
  async detect(ctx: DetectorContext): Promise<AntibotEvidence[]> {
    const out: AntibotEvidence[] = [];
    const integrity = ctx.telemetry.integrity;
    if (!integrity) return out;

    const overriddenCount = Number(integrity.overriddenApiCount ?? 0);
    if (overriddenCount >= 2) {
      out.push({
        detector: "browser_integrity",
        code: "native_api_overridden",
        ...resolveWeight("native_api_overridden"),
        metadata: {
          count: overriddenCount,
          apis: integrity.overriddenApis,
        },
      });
    }

    if (integrity.navTampered === true) {
      out.push({
        detector: "browser_integrity",
        code: "navigator_webdriver_tampered",
        ...resolveWeight("navigator_webdriver_tampered"),
      });
    }

    if (integrity.noPermissions === true) {
      out.push({
        detector: "browser_integrity",
        code: "permissions_api_missing",
        ...resolveWeight("permissions_api_missing"),
        metadata: { note: "navigator.permissions absent — headless-like profile" },
      });
    }

    if (integrity.noChromeRuntime === true) {
      // Chrome without chrome.runtime is unusual (headless or modified)
      const ua = ctx.userAgent.toLowerCase();
      if (ua.includes("chrome") && !ua.includes("chromium") && !ua.includes("electron")) {
        out.push({
          detector: "browser_integrity",
          code: "chrome_runtime_missing",
          ...resolveWeight("chrome_runtime_missing"),
        });
      }
    }

    // Font list anomaly: bots often have 0 fonts or an unrealistically small list
    const fontCount = Number(ctx.telemetry.device?.fontCount ?? -1);
    if (fontCount >= 0 && fontCount === 0) {
      out.push({
        detector: "browser_integrity",
        code: "no_fonts_detected",
        ...resolveWeight("no_fonts_detected"),
        metadata: { fontCount },
      });
    }

    if (integrity.userscriptHint === true) {
      out.push({
        detector: "browser_integrity",
        code: "userscript_runtime",
        ...resolveWeight("userscript_runtime"),
        metadata: { note: "GM_* / unsafeWindow / Tampermonkey-like globals" },
      });
    }

    if (integrity.extensionScriptHint === true) {
      out.push({
        detector: "browser_integrity",
        code: "extension_script_injected",
        ...resolveWeight("extension_script_injected"),
        metadata: { note: "chrome-extension:// or moz-extension:// script in DOM" },
      });
    }

    if (integrity.userscriptNetworkStack === true) {
      out.push({
        detector: "browser_integrity",
        code: "userscript_network_stack",
        ...resolveWeight("userscript_network_stack"),
        metadata: { note: "fetch/XHR stack frames match Tampermonkey/extension" },
      });
    }

    if (integrity.injectedInlineScript === true) {
      out.push({
        detector: "browser_integrity",
        code: "injected_inline_script",
        ...resolveWeight("injected_inline_script"),
        metadata: { note: "inline/blob/data script injected after boot" },
      });
    }

    if (integrity.consoleTampered === true) {
      out.push({
        detector: "browser_integrity",
        code: "console_api_tampered",
        ...resolveWeight("console_api_tampered"),
        metadata: { note: "console.* no longer native (F12/overlay hooks)" },
      });
    }

    if (integrity.hookBypass === true) {
      out.push({
        detector: "browser_integrity",
        code: "integrity_hook_bypass",
        ...resolveWeight("integrity_hook_bypass"),
        metadata: { note: "integrity fetch/XHR wrappers replaced after install" },
      });
    }

    if (integrity.userscriptManagerInstalled === true) {
      out.push({
        detector: "browser_integrity",
        code: "userscript_manager_installed",
        ...resolveWeight("userscript_manager_installed"),
        metadata: {
          note: "userscript manager present in browser (TM/VM/fork)",
          managers: integrity.userscriptManagers,
        },
      });
    }

    return out;
  },
};
