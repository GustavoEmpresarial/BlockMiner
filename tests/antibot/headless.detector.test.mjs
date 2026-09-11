import test from "node:test";
import assert from "node:assert/strict";

const { headlessDetector } = await import("../../server/modules/antibot/detectors/headless.detector.ts");

function ctx(telemetry, userAgent = "") {
  return { prisma: {}, telemetry, userId: 1, ip: "1.2.3.4", userAgent, sessionId: "s1", eventType: "game:test" };
}

test("headlessDetector: navigator.webdriver flag → navigator_webdriver evidence", async () => {
  const ev = await headlessDetector.detect(ctx({ browser: { webdriver: true } }));
  assert.ok(ev.some((e) => e.code === "navigator_webdriver"));
});

test("headlessDetector: known automation runtimes each produce their own code", async () => {
  for (const [key, code] of [
    ["headless", "headless_browser"],
    ["selenium", "selenium"],
    ["puppeteer", "puppeteer"],
    ["playwright", "playwright"],
    ["phantomjs", "phantomjs"],
    ["electron", "electron_automation"],
    ["automationApi", "automation_api"],
  ]) {
    const ev = await headlessDetector.detect(ctx({ browser: { [key]: true } }));
    assert.ok(ev.some((e) => e.code === code), `expected ${code} for browser.${key}`);
  }
});

test("headlessDetector: known-automation UA regex flags known_automation_ua", async () => {
  const ev = await headlessDetector.detect(ctx({ browser: {} }, "Mozilla/5.0 HeadlessChrome/120.0"));
  assert.ok(ev.some((e) => e.code === "known_automation_ua"));
});

test("headlessDetector: zero plugins alone does NOT fire missing_plugins (mobile FP)", async () => {
  const ev = await headlessDetector.detect(ctx({ browser: {}, environment: { plugins: 0 } }));
  assert.ok(!ev.some((e) => e.code === "missing_plugins"));
});

test("headlessDetector: zero plugins + headless hint → missing_plugins corroboration", async () => {
  const ev = await headlessDetector.detect(ctx({ browser: { headless: true }, environment: { plugins: 0 } }));
  assert.ok(ev.some((e) => e.code === "missing_plugins"));
  assert.ok(ev.some((e) => e.code === "headless_browser"));
});

test("headlessDetector: zero plugins with only webdriver does NOT add missing_plugins", async () => {
  const ev = await headlessDetector.detect(ctx({ browser: { webdriver: true }, environment: { plugins: 0 } }));
  assert.ok(!ev.some((e) => e.code === "missing_plugins"));
});

test("headlessDetector: clean telemetry produces no evidence", async () => {
  const ev = await headlessDetector.detect(
    ctx({ browser: { webdriver: false }, environment: { plugins: 5 } }, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"),
  );
  assert.deepEqual(ev, []);
});
