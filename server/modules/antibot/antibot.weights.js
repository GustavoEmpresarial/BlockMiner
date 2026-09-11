function envInt(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}
/** Master weight table. Codes are stable and persisted on evidence rows. */
const WEIGHT_TABLE = {
    // --- Browser / automation (strong — keep weights high) -------------------
    navigator_webdriver: { weight: 35, severity: "high", reason: "navigator.webdriver flag set" },
    headless_browser: { weight: 45, severity: "critical", reason: "Headless browser detected" },
    selenium: { weight: 45, severity: "critical", reason: "Selenium automation runtime detected" },
    puppeteer: { weight: 45, severity: "critical", reason: "Puppeteer automation runtime detected" },
    playwright: { weight: 45, severity: "critical", reason: "Playwright automation runtime detected" },
    phantomjs: { weight: 45, severity: "critical", reason: "PhantomJS environment detected" },
    electron_automation: { weight: 30, severity: "high", reason: "Automated Electron environment detected" },
    automation_api: { weight: 40, severity: "critical", reason: "Browser automation API exposed (CDP)" },
    known_automation_ua: { weight: 35, severity: "high", reason: "User-Agent matches known automation tooling" },
    inconsistent_ua: { weight: 12, severity: "medium", reason: "User-Agent inconsistent with environment" },
    // Weak: modern Chrome/mobile often report 0 plugins — token weight only.
    missing_plugins: { weight: 3, severity: "low", reason: "No browser plugins / headless-like profile" },
    // --- Environment / consistency -------------------------------------------
    timezone_mismatch: { weight: 12, severity: "medium", reason: "Timezone inconsistent with IP locale" },
    spoofed_language: { weight: 5, severity: "low", reason: "Language/header mismatch" },
    // --- Fingerprint / device -------------------------------------------------
    fingerprint_churn: { weight: 20, severity: "high", reason: "Fingerprint changes too frequently" },
    device_churn: { weight: 18, severity: "medium", reason: "Device identity changing repeatedly" },
    location_jump: { weight: 15, severity: "medium", reason: "Abrupt geo-location change" },
    locale_churn: { weight: 10, severity: "low", reason: "Frequent language/timezone changes" },
    // --- Relationship (multi-account) ----------------------------------------
    shared_device_many_accounts: { weight: 30, severity: "high", reason: "Same device used by many accounts" },
    shared_ip_many_accounts: { weight: 20, severity: "medium", reason: "Same IP shared across many accounts" },
    shared_fingerprint_accounts: { weight: 22, severity: "high", reason: "Same fingerprint across multiple accounts" },
    shared_wallet_accounts: { weight: 18, severity: "medium", reason: "Wallet linked to multiple accounts" },
    // --- Browser integrity ---------------------------------------------------
    native_api_overridden: { weight: 25, severity: "high", reason: "Native browser APIs overridden (Proxy/custom impl)" },
    navigator_webdriver_tampered: { weight: 25, severity: "high", reason: "navigator.webdriver descriptor tampered" },
    // Weak noise — lowered; only full weight when corroborated.
    permissions_api_missing: { weight: 5, severity: "low", reason: "navigator.permissions API absent (headless-like)" },
    chrome_runtime_missing: { weight: 6, severity: "low", reason: "Chrome reported in UA but chrome.runtime missing" },
    no_fonts_detected: { weight: 4, severity: "low", reason: "Zero system fonts detected — virtual/sandboxed environment" },
    // Client-reported userscript / extension surfaces — ALL weak tier.
    // Alone they only contribute token points (WEAK_UNCORROBORATED_*), never ban clean users.
    userscript_runtime: { weight: 8, severity: "low", reason: "Userscript runtime globals detected (Tampermonkey/GM_*)" },
    extension_script_injected: { weight: 5, severity: "low", reason: "Browser-extension script tag present in page DOM" },
    userscript_network_stack: {
        weight: 10,
        severity: "medium",
        reason: "Network call stack indicates userscript/extension (Tampermonkey)",
    },
    injected_inline_script: {
        weight: 8,
        severity: "low",
        reason: "Inline/blob/data script injected into page after boot",
    },
    console_api_tampered: {
        weight: 4,
        severity: "low",
        reason: "console.* APIs no longer native (devtools/overlay hooks)",
    },
    integrity_hook_bypass: {
        weight: 12,
        severity: "medium",
        reason: "Integrity network hooks replaced after install (F12/TM patch)",
    },
    // Presence only — many legit users have VM/TM. Signal for ops, not a ban path alone.
    userscript_manager_installed: {
        weight: 8,
        severity: "low",
        reason: "Userscript manager installed/active (Tampermonkey/Violentmonkey/fork)",
    },
    // --- Behaviour ------------------------------------------------------------
    repetitive_behavior: { weight: 18, severity: "high", reason: "Extremely repetitive action pattern" },
    impossible_speed: { weight: 35, severity: "critical", reason: "Action sequence impossible for a human" },
    perfect_intervals: { weight: 16, severity: "high", reason: "Machine-regular action intervals" },
    non_stop_session: { weight: 10, severity: "medium", reason: "Continuous session beyond human endurance" },
    no_human_input: { weight: 10, severity: "medium", reason: "No organic pointer/keyboard input observed" },
};
/**
 * Resolve the (possibly env-overridden) weight for a code.
 * Falls back to a small default so unknown signals still register.
 */
export function resolveWeight(code) {
    const entry = WEIGHT_TABLE[code];
    const envName = `ANTIBOT_W_${code.toUpperCase()}`;
    if (!entry) {
        return { weight: envInt(envName, 5), severity: "info", reason: code };
    }
    return { weight: envInt(envName, entry.weight), severity: entry.severity, reason: entry.reason };
}
/**
 * Signal provenance tiers — the calibration that stops mass false positives.
 *
 * A naive engine that sums every weight on every beacon drives the score to 100 the moment any
 * spoofable client boolean keeps firing. To be defensible ("no user banned on guesswork") each
 * code is classified by how much it can be trusted:
 *
 *  - `strong`: real automation-runtime signals a normal browser never emits. Near-zero
 *    false-positive when present, so they count on their own.
 *  - `structural`: facts the SERVER counts (fingerprint/device churn over a window, IP/geo
 *    jumps, multi-account sharing). The client supplies the raw value but the server does the
 *    counting, so a legitimate single-device human does not trip them. These act as
 *    corroboration.
 *  - `weak`: behavioural / browser-integrity booleans the client self-reports. Individually
 *    high false-positive (a normal Chrome legitimately has 0 plugins, no chrome.runtime, a
 *    16h open tab, etc). They only count at full weight when corroborated by a strong/
 *    structural signal; uncorroborated they are capped to a token amount so they can never
 *    alone reach a ban band.
 */
export const STRONG_CODES = new Set([
    "navigator_webdriver",
    "headless_browser",
    "selenium",
    "puppeteer",
    "playwright",
    "phantomjs",
    "automation_api",
    "electron_automation",
    "known_automation_ua",
    "navigator_webdriver_tampered",
    // Keep native_api_overridden strong (real automation often patches many natives).
    // Do NOT put TM/VM/F12 client booleans here — they FP on clean users with extensions.
    "native_api_overridden",
]);
export const STRUCTURAL_CODES = new Set([
    "fingerprint_churn",
    "device_churn",
    "location_jump",
    "shared_device_many_accounts",
    "shared_ip_many_accounts",
    "shared_fingerprint_accounts",
    "shared_wallet_accounts",
    "inconsistent_ua",
    "timezone_mismatch",
]);
export function tierForCode(code) {
    if (STRONG_CODES.has(code))
        return "strong";
    if (STRUCTURAL_CODES.has(code))
        return "structural";
    return "weak";
}
/** Per-weak-code contribution when nobody corroborates (token points only). */
export const WEAK_UNCORROBORATED_PER_CODE = envInt("ANTIBOT_WEAK_PER_CODE", 3);
/** Hard cap on the summed uncorroborated weak contribution. */
export const WEAK_UNCORROBORATED_CAP = envInt("ANTIBOT_WEAK_CAP", 15);
/** Window (days) over which DISTINCT active codes are scored. Old codes drop off naturally. */
export const SCORE_WINDOW_DAYS = envInt("ANTIBOT_SCORE_WINDOW_DAYS", 7);
/**
 * State-based score: given the DISTINCT codes active in the window (each with its resolved
 * weight), compute a 0-100 score. Each code counts AT MOST ONCE (no per-beacon accumulation).
 * Weak client signals are gated on corroboration by a strong/structural signal.
 */
export function computeScoreFromActiveCodes(active) {
    let hard = 0; // strong + structural
    let weakFull = 0; // weak, summed at full weight
    let weakToken = 0; // weak, summed at token weight (uncorroborated path)
    let corroborated = false;
    for (const { code, weight } of active) {
        const tier = tierForCode(code);
        if (tier === "strong" || tier === "structural") {
            hard += weight;
            corroborated = true;
        }
        else {
            weakFull += weight;
            weakToken += Math.min(weight, WEAK_UNCORROBORATED_PER_CODE);
        }
    }
    const weakContribution = corroborated ? weakFull : Math.min(weakToken, WEAK_UNCORROBORATED_CAP);
    const score = Math.max(0, Math.min(MAX_SCORE, Math.round(hard + weakContribution)));
    return { score, corroborated };
}
/** Maximum score clamp. Score aging is windowed (SCORE_WINDOW_DAYS), not exponential decay. */
export const MAX_SCORE = 100;
/** Thresholds for alert generation. */
export const ALERT_RISK_THRESHOLD = envInt("ANTIBOT_ALERT_RISK_THRESHOLD", 61);
export const ALERT_DEVICE_ACCOUNT_THRESHOLD = envInt("ANTIBOT_ALERT_DEVICE_ACCOUNTS", 5);
