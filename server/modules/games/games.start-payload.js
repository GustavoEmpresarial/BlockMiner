/**
 * Parse game:start payload — string slug (legacy) or { slug, antibot }.
 * Keeps slug validation local so unit tests do not need games.pure.ts (dist-only).
 */
function asBool(v) {
    return v === true || v === "true" || v === 1 || v === "1";
}
function resolveSlug(raw, allowedSlugs) {
    const slug = String(raw ?? "").trim();
    if (!slug || !(slug in allowedSlugs))
        return null;
    return slug;
}
function readTurnstileToken(body) {
    const raw = body.cfTurnstileToken ??
        body.cf_turnstile_token ??
        body["cf-turnstile-response"] ??
        body.turnstileToken;
    return typeof raw === "string" ? raw.trim() : "";
}
export function parseGameStartPayload(raw, allowedSlugs) {
    if (typeof raw === "string") {
        return { slug: resolveSlug(raw, allowedSlugs), automationDetected: false, cfTurnstileToken: "" };
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return { slug: null, automationDetected: false, cfTurnstileToken: "" };
    }
    const body = raw;
    const slug = resolveSlug(body.slug ?? body.game ?? body.gameSlug, allowedSlugs);
    const hints = body.antibot && typeof body.antibot === "object" && !Array.isArray(body.antibot)
        ? body.antibot
        : body;
    const automationDetected = asBool(hints.webdriver) || asBool(hints.isBot) || asBool(body.webdriver) || asBool(body.isBot);
    return { slug, automationDetected, cfTurnstileToken: readTurnstileToken(body) };
}
