/**
 * Port of legacy/server/modules/antibot/detectors/headless.detector.ts.
 *
 * HeadlessDetector — identifies known browser automation runtimes. Inspects navigator flags,
 * injected automation globals, and suspicious User-Agent strings. Each match is a separate,
 * weighted evidence so multiple corroborating signals compound the score.
 */
import type { AntibotDetector, AntibotEvidence, DetectorContext } from "../antibot.types.js";
import { resolveWeight } from "../antibot.weights.js";

const KNOWN_AUTOMATION_UA = [
  /puppeteer/i,
  /phantomjs/i,
  /selenium/i,
  /headless/i,
  /webdriver/i,
  /playwright/i,
  /electron/i,
  /slimerjs/i,
  /nightmarejs/i,
];

export const headlessDetector: AntibotDetector = {
  name: "headless",
  async detect(ctx: DetectorContext): Promise<AntibotEvidence[]> {
    const out: AntibotEvidence[] = [];
    const b = ctx.telemetry.browser ?? {};

    if (b.webdriver === true) {
      const w = resolveWeight("navigator_webdriver");
      out.push({ detector: "headless", code: "navigator_webdriver", ...w, metadata: { source: "navigator.webdriver" } });
    }
    if (b.headless === true) {
      out.push({ detector: "headless", code: "headless_browser", ...resolveWeight("headless_browser") });
    }
    if (b.selenium === true) {
      out.push({ detector: "headless", code: "selenium", ...resolveWeight("selenium") });
    }
    if (b.puppeteer === true) {
      out.push({ detector: "headless", code: "puppeteer", ...resolveWeight("puppeteer") });
    }
    if (b.playwright === true) {
      out.push({ detector: "headless", code: "playwright", ...resolveWeight("playwright") });
    }
    if (b.phantomjs === true) {
      out.push({ detector: "headless", code: "phantomjs", ...resolveWeight("phantomjs") });
    }
    if (b.electron === true) {
      out.push({ detector: "headless", code: "electron_automation", ...resolveWeight("electron_automation") });
    }
    if (b.automationApi === true) {
      out.push({ detector: "headless", code: "automation_api", ...resolveWeight("automation_api") });
    }

    const ua = b.userAgent ?? ctx.userAgent;
    if (ua && KNOWN_AUTOMATION_UA.some((re) => re.test(ua))) {
      out.push({
        detector: "headless",
        code: "known_automation_ua",
        ...resolveWeight("known_automation_ua"),
        metadata: { userAgent: ua.slice(0, 200) },
      });
    }
    if (b.knownAutomationUA === true) {
      out.push({ detector: "headless", code: "known_automation_ua", ...resolveWeight("known_automation_ua") });
    }
    if (b.inconsistentUA === true) {
      out.push({ detector: "headless", code: "inconsistent_ua", ...resolveWeight("inconsistent_ua") });
    }

    const env = ctx.telemetry.environment ?? {};
    // Zero plugins is common on mobile / locked-down Chrome — only emit when another
    // automation hint is already present (corroboration, not a standalone FP).
    const automationHint =
      b.headless === true ||
      b.selenium === true ||
      b.puppeteer === true ||
      b.playwright === true ||
      b.phantomjs === true ||
      b.automationApi === true ||
      b.electron === true;
    if (typeof env.plugins === "number" && env.plugins === 0 && automationHint) {
      out.push({ detector: "headless", code: "missing_plugins", ...resolveWeight("missing_plugins") });
    }
    return out;
  },
};
