/**
 * Parse game:start payload — string slug (legacy) or { slug, antibot }.
 * Keeps slug validation local so unit tests do not need games.pure.ts (dist-only).
 */

export type GameStartAntibotHints = {
  webdriver?: boolean;
  isBot?: boolean;
};

export type ParsedGameStart = {
  slug: string | null;
  automationDetected: boolean;
  /** Optional Turnstile token for the every-N reward gate. */
  cfTurnstileToken: string;
};

function asBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

function resolveSlug(raw: unknown, allowedSlugs: Record<string, string>): string | null {
  const slug = String(raw ?? "").trim();
  if (!slug || !(slug in allowedSlugs)) return null;
  return slug;
}

function readTurnstileToken(body: Record<string, unknown>): string {
  const raw =
    body.cfTurnstileToken ??
    body.cf_turnstile_token ??
    body["cf-turnstile-response"] ??
    body.turnstileToken;
  return typeof raw === "string" ? raw.trim() : "";
}

export function parseGameStartPayload(
  raw: unknown,
  allowedSlugs: Record<string, string>,
): ParsedGameStart {
  if (typeof raw === "string") {
    return { slug: resolveSlug(raw, allowedSlugs), automationDetected: false, cfTurnstileToken: "" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { slug: null, automationDetected: false, cfTurnstileToken: "" };
  }
  const body = raw as Record<string, unknown>;
  const slug = resolveSlug(body.slug ?? body.game ?? body.gameSlug, allowedSlugs);
  const hints =
    body.antibot && typeof body.antibot === "object" && !Array.isArray(body.antibot)
      ? (body.antibot as GameStartAntibotHints)
      : body;
  const automationDetected =
    asBool(hints.webdriver) || asBool(hints.isBot) || asBool(body.webdriver) || asBool(body.isBot);
  return { slug, automationDetected, cfTurnstileToken: readTurnstileToken(body) };
}
