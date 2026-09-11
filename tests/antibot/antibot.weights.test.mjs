import test from "node:test";
import assert from "node:assert/strict";

const weights = await import("../../server/modules/antibot/antibot.weights.ts");

test("computeScoreFromActiveCodes: a single strong code counts at full weight, corroborated=true", () => {
  const { score, corroborated } = weights.computeScoreFromActiveCodes([{ code: "navigator_webdriver", weight: 25 }]);
  assert.equal(score, 25);
  assert.equal(corroborated, true);
});

test("computeScoreFromActiveCodes: weak codes alone are capped (uncorroborated), never reach a ban band", () => {
  const { score, corroborated } = weights.computeScoreFromActiveCodes([
    { code: "missing_plugins", weight: 8 },
    { code: "no_fonts_detected", weight: 10 },
    { code: "permissions_api_missing", weight: 12 },
    { code: "chrome_runtime_missing", weight: 15 },
  ]);
  assert.equal(corroborated, false);
  assert.ok(score <= weights.WEAK_UNCORROBORATED_CAP, `expected score <= cap, got ${score}`);
});

test("computeScoreFromActiveCodes: a weak code corroborated by a structural code counts at full weight", () => {
  const { score, corroborated } = weights.computeScoreFromActiveCodes([
    { code: "fingerprint_churn", weight: 20 }, // structural
    { code: "missing_plugins", weight: 8 }, // weak, now corroborated
  ]);
  assert.equal(corroborated, true);
  assert.equal(score, 28);
});

test("computeScoreFromActiveCodes: score is clamped to 100", () => {
  const { score } = weights.computeScoreFromActiveCodes([
    { code: "headless_browser", weight: 40 },
    { code: "selenium", weight: 40 },
    { code: "puppeteer", weight: 40 },
  ]);
  assert.equal(score, 100);
});

test("tierForCode: userscript/F12 client signals stay weak (no solo ban path)", () => {
  for (const code of [
    "userscript_manager_installed",
    "userscript_runtime",
    "userscript_network_stack",
    "integrity_hook_bypass",
    "injected_inline_script",
    "console_api_tampered",
    "extension_script_injected",
  ]) {
    assert.equal(weights.tierForCode(code), "weak", code);
  }
});

test("computeScoreFromActiveCodes: full TM/VM integrity stack alone stays under alert threshold", () => {
  const codes = [
    "userscript_manager_installed",
    "userscript_runtime",
    "userscript_network_stack",
    "integrity_hook_bypass",
    "injected_inline_script",
    "console_api_tampered",
    "extension_script_injected",
  ].map((code) => ({ code, weight: weights.resolveWeight(code).weight }));
  const { score, corroborated } = weights.computeScoreFromActiveCodes(codes);
  assert.equal(corroborated, false);
  assert.ok(score <= weights.WEAK_UNCORROBORATED_CAP);
  assert.ok(score < weights.ALERT_RISK_THRESHOLD, `clean TM stack score=${score} must be < ${weights.ALERT_RISK_THRESHOLD}`);
});

test("resolveWeight: unknown code falls back to a small info-severity default", () => {
  const w = weights.resolveWeight("totally_unknown_code_xyz");
  assert.equal(w.severity, "info");
  assert.equal(w.weight, 5);
});

test("resolveWeight: env override (ANTIBOT_W_<CODE>) takes precedence", () => {
  process.env.ANTIBOT_W_NAVIGATOR_WEBDRIVER = "99";
  try {
    const w = weights.resolveWeight("navigator_webdriver");
    assert.equal(w.weight, 99);
  } finally {
    delete process.env.ANTIBOT_W_NAVIGATOR_WEBDRIVER;
  }
});
