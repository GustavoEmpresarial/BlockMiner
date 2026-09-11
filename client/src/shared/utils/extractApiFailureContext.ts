/** Pure helpers to lift useful fields from axios-like / fetch failures. */

const BODY_SNIPPET_MAX = 500;

export type ApiFailureContext = {
  method?: string;
  apiUrl?: string;
  statusCode?: number;
  code?: string;
  responseMessage?: string;
  requestId?: string;
  bodySnippet?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

function readHeader(
  headers: unknown,
  name: string,
): string | undefined {
  if (!isRecord(headers)) return undefined;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower && (typeof v === "string" || typeof v === "number")) {
      return String(v);
    }
  }
  return undefined;
}

function snippetFromBody(data: unknown): string | undefined {
  if (data == null) return undefined;
  try {
    const raw = typeof data === "string" ? data : JSON.stringify(data);
    if (!raw) return undefined;
    return raw.length > BODY_SNIPPET_MAX ? raw.slice(0, BODY_SNIPPET_MAX) + "…" : raw;
  } catch {
    return undefined;
  }
}

/**
 * Extract method / API URL / status / business code / body snippet from an
 * axios error (or a plain Error with optional `response`/`config` shape).
 */
export function extractApiFailureContext(err: unknown): ApiFailureContext {
  if (err == null || typeof err !== "object") return {};

  const e = err as {
    message?: unknown;
    config?: { method?: unknown; url?: unknown; baseURL?: unknown; headers?: unknown };
    response?: {
      status?: unknown;
      data?: unknown;
      headers?: unknown;
    };
    code?: unknown;
  };

  const config = e.config;
  const response = e.response;
  const data = response?.data;
  const dataRec = isRecord(data) ? data : null;

  const method =
    typeof config?.method === "string" ? config.method.toUpperCase() : undefined;

  let apiUrl: string | undefined;
  if (typeof config?.url === "string") {
    const base = typeof config.baseURL === "string" ? config.baseURL.replace(/\/$/, "") : "";
    const path = config.url.startsWith("http") ? config.url : `${base}${config.url.startsWith("/") ? "" : "/"}${config.url}`;
    apiUrl = path || undefined;
  }

  const statusCode =
    typeof response?.status === "number" && Number.isFinite(response.status)
      ? response.status
      : undefined;

  const code =
    (dataRec && typeof dataRec.code === "string" && dataRec.code) ||
    (typeof e.code === "string" && e.code.startsWith("ERR_") ? undefined : typeof e.code === "string" ? e.code : undefined) ||
    undefined;

  const responseMessage =
    (dataRec && typeof dataRec.message === "string" && dataRec.message) ||
    (dataRec && typeof dataRec.error === "string" && dataRec.error) ||
    undefined;

  const requestId =
    readHeader(response?.headers, "x-request-id") ||
    readHeader(config?.headers, "x-request-id") ||
    (dataRec && typeof dataRec.requestId === "string" ? dataRec.requestId : undefined);

  return {
    ...(method ? { method } : {}),
    ...(apiUrl ? { apiUrl } : {}),
    ...(statusCode != null ? { statusCode } : {}),
    ...(code ? { code } : {}),
    ...(responseMessage ? { responseMessage } : {}),
    ...(requestId ? { requestId } : {}),
    ...(snippetFromBody(data) ? { bodySnippet: snippetFromBody(data) } : {}),
  };
}

/** Prefer business message over axios's generic "Request failed with status code N". */
export function resolveApiFailureMessage(
  fallback: string,
  extracted: ApiFailureContext,
): string {
  if (extracted.responseMessage && extracted.responseMessage.trim()) {
    return extracted.responseMessage.trim().slice(0, 500);
  }
  if (extracted.code && /^Request failed with status code \d+$/i.test(fallback)) {
    return extracted.code;
  }
  return fallback;
}
