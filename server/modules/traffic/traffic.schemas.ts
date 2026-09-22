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

export type ClientErrorBreadcrumb = {
  ts: number;
  type: "navigation" | "click" | "xhr" | "fetch" | "console" | "custom";
  message: string;
  data?: Record<string, unknown> | null;
};

export type ClientErrorEnvironment = {
  viewport?: string | null;
  connection?: string | null;
  language?: string | null;
  memoryMb?: number | null;
  online?: boolean | null;
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
  fingerprint?: string | null;
  breadcrumbs?: ClientErrorBreadcrumb[] | null;
  environment?: ClientErrorEnvironment | null;
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

function sanitizeBreadcrumbs(raw: unknown): ClientErrorBreadcrumb[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const validTypes = new Set(["navigation", "click", "xhr", "fetch", "console", "custom"]);
  const result: ClientErrorBreadcrumb[] = [];

  // Limit to at most 15 most recent breadcrumbs to prevent payload bloat
  const slice = raw.slice(-15);
  for (const item of slice) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const rawType = String(b.type || "custom").toLowerCase();
    const type = (validTypes.has(rawType) ? rawType : "custom") as ClientErrorBreadcrumb["type"];
    const message = sanitizeString(b.message, 300) ?? "";
    const ts = typeof b.ts === "number" && !isNaN(b.ts) ? b.ts : Date.now();

    let data: Record<string, unknown> | null = null;
    if (b.data && typeof b.data === "object" && !Array.isArray(b.data)) {
      data = {};
      const entries = Object.entries(b.data as Record<string, unknown>).slice(0, 8);
      for (const [k, v] of entries) {
        const cleanK = String(k).slice(0, 32);
        if (typeof v === "string") data[cleanK] = v.slice(0, 200);
        else if (typeof v === "number" || typeof v === "boolean") data[cleanK] = v;
      }
    }

    result.push({ ts, type, message, data });
  }

  return result.length > 0 ? result : null;
}

function sanitizeEnvironment(raw: unknown): ClientErrorEnvironment | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const env = raw as Record<string, unknown>;
  return {
    viewport: sanitizeString(env.viewport, 32),
    connection: sanitizeString(env.connection, 32),
    language: sanitizeString(env.language, 32),
    memoryMb: typeof env.memoryMb === "number" && !isNaN(env.memoryMb) ? Math.round(env.memoryMb) : null,
    online: typeof env.online === "boolean" ? env.online : null,
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
    fingerprint: sanitizeString(b.fingerprint, 64),
    breadcrumbs: sanitizeBreadcrumbs(b.breadcrumbs),
    environment: sanitizeEnvironment(b.environment),
  };
}
