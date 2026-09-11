/**
 * Ported from legacy/server/modules/traffic/traffic.routes.ts.
 * Public telemetry: malformed bodies yield fewer fields, not a 400.
 */

export type HitBody = {
  path: string;
  referrerDomain: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
};

export type ClientErrorBody = {
  message: string;
  stack: string | null;
  componentStack: string | null;
  url: string | null;
  category: "api_failure" | "crash";
  statusCode: number | null;
  buildId: string | null;
  code: string | null;
  operation: string | null;
  requestId: string | null;
};

export function sanitizeString(v: unknown, max = 255): string | null {
  if (!v || typeof v !== "string") return null;
  const s = v.trim().slice(0, max);
  return s || null;
}

export function parseHitBody(body: unknown): HitBody {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    path: sanitizeString(b.path, 500) ?? "/",
    referrerDomain: sanitizeString(b.referrerDomain),
    utmSource: sanitizeString(b.utmSource),
    utmMedium: sanitizeString(b.utmMedium),
    utmCampaign: sanitizeString(b.utmCampaign),
  };
}

export function parseClientErrorBody(body: unknown): ClientErrorBody {
  const b = (body ?? {}) as Record<string, unknown>;
  const rawCategory = sanitizeString(b.category, 32) ?? "crash";
  const category = rawCategory === "api_failure" ? "api_failure" : "crash";
  return {
    message: sanitizeString(b.message, 800) ?? "",
    stack: sanitizeString(b.stack, 4000),
    componentStack: sanitizeString(b.componentStack, 4000),
    url: sanitizeString(b.url, 800),
    category,
    statusCode: typeof b.statusCode === "number" ? b.statusCode : null,
    buildId: sanitizeString(b.buildId, 64),
    code: sanitizeString(b.code, 64),
    operation: sanitizeString(b.operation, 120),
    requestId: sanitizeString(b.requestId, 80),
  };
}
