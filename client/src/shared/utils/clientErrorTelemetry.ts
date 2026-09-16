/**
 * Client-side telemetry post + drop rules for /api/track/client-error.
 * Mirrors server/modules/traffic/traffic.errors.ts + collector-v5 (keep in sync).
 * Uses fetch (not axios) so auth.store can install an interceptor without cycles.
 */

import {
  extractApiFailureContext,
  resolveApiFailureMessage,
} from "./extractApiFailureContext";

/** Same window as SPA collector `DEDUPE_MS` — suppress duplicate posts. */
export const CLIENT_ERROR_TELEMETRY_DEDUPE_MS = 15_000;

const CAPTCHA_CODES = new Set([
  "CAPTCHA_REQUIRED",
  "CAPTCHA_FAILED",
  "CAPTCHA_DISABLED",
]);

const GATE_CODES = new Set([
  "SITE_MAINTENANCE",
  "GATE_INACTIVE",
  "FEATURE_DISABLED",
  "SIDEBAR_HIDDEN",
  "CAPTCHA_DISABLED",
]);

const AUTH_CODES = new Set([
  "ACCESS_MISSING",
  "UNAUTHORIZED",
  "SESSION_EXPIRED",
  "SESSION_SUPERSEDED",
]);

const BENIGN_AUTO_MINING_CODES = new Set([
  "CLAIM_NOT_DUE",
  "PRESENCE_STALE",
  "PRESENCE_INSUFFICIENT",
  "SESSION_PAUSED",
  "CONCURRENT_CLAIM",
  "NO_SESSION",
]);

/** Expected UX / policy codes the UI already surfaces — not defects. */
export const EXPECTED_CLIENT_UX_CODES = new Set([
  "INVALID_STATE",
  "INVALID_BODY",
  "INVALID_AMOUNT",
  "INVALID_TX_HASH",
  "INVALID_PURPOSE",
  "INVALID_PROVIDER",
  "INVALID_SOLUTION",
  "INVALID_CSRF_TOKEN",
  "INSUFFICIENT_BALANCE",
  "FAN_NO_CREDITS",
  "RACK_NO_CREDITS",
  "RACK_NOT_EMPTY",
  "FAN_INSUFFICIENT_BALANCE",
  "RACK_INSUFFICIENT_BALANCE",
  "SHOP_INSUFFICIENT_BALANCE",
  "SHOP_OUT_OF_STOCK",
  "SHOP_PURCHASE_LIMIT_REACHED",
  "SHOP_MINER_UNAVAILABLE",
  "SHOP_INVALID_QUANTITY",
  "SHOP_INVALID_MINER_ID",
  "FAN_NOT_AVAILABLE_YET",
  "FAN_INVALID_SKU",
  "FAN_INVALID_QUANTITY",
  "RACK_NOT_AVAILABLE_YET",
  "RACK_INVALID_SKU",
  "RACK_INVALID_QUANTITY",
  "ALREADY_ACTIVE",
  "ALREADY_CLAIMED",
  "ALREADY_COLLECTED",
  "ALREADY_PAID",
  "ALREADY_SOLVED",
  "NOT_CLICKED",
  "NOT_COMPLETED",
  "NOT_STARTED",
  "NOT_LIVE",
  "VPN_PROXY_BLOCKED",
  "USERSCRIPT_MANAGER_BLOCKED",
  "ACCOUNT_LOCKED",
  "TOO_MANY_REQUESTS",
  "RATE_LIMIT_EXCEEDED",
  "TOO_MANY_ATTEMPTS",
  "IDEMPOTENT_REPLAY",
  "RACE_CONDITION_DETECTED",
  "BAD_PASSWORD",
  // Observed flooding the admin panel (15/09/2026): every one of these is a rule the UI
  // already explains to the user, not a defect.
  "DAILY_LIMIT",
  "ADJACENT_RACK_OCCUPIED",
  "SESSION_NOT_ACTIVE",
  "USER_ALREADY_EXISTS",
  "EMAIL_PROVIDER_NOT_ALLOWED",
  "NO_REWARDS",
  "FAN_NEED_RACK",
  "BURN_NOT_READY",
  "SHORTLINK_NO_SESSION",
  "WALLET_ALREADY_LINKED",
]);

/**
 * Browser/third-party noise that reaches window.onerror or unhandledrejection but is not a
 * defect in this app:
 * - "ResizeObserver loop …" is a spec-level notification Chrome surfaces as an error event;
 *   it has no stack and no user impact (was 8 of the 15 "critical" crashes).
 * - EIP-1193 disconnect + proxy-invariant TypeErrors come from injected wallet providers.
 * - "Cannot redefine property" comes from extensions patching built-ins.
 */
const THIRD_PARTY_NOISE_TEXT =
  /ResizeObserver loop (limit exceeded|completed with undelivered notifications)|provider is disconnected from all chains|Cannot redefine property|Extension context invalidated/i;

const EXPECTED_BUSINESS_RULE_TEXT =
  /insufficient|insuficiente|already (claimed|active|purchased)|cooldown|limit reached|limite|not eligible|sold out|esgotad|não tem ventiladores|nao tem ventiladores|não tem racks|nao tem racks|ventiladores disponíveis|racks disponíveis/i;

const EXPECTED_CLIENT_API_FAILURE_TEXT =
  /3\+ cycles with no grant \(last code: (CLAIM_NOT_DUE|PRESENCE_STALE|PRESENCE_INSUFFICIENT|SESSION_PAUSED|CONCURRENT_CLAIM|NO_SESSION)\)|Sessão ZerAds inválida|Nenhuma sessão ZerAds|Could not open the ZerAds/i;

export type ClientTelemetryPayload = {
  category?: "api_failure" | "crash";
  message: string;
  operation?: string | null;
  statusCode?: number | null;
  code?: string | null;
  requestId?: string | null;
  stack?: string | null;
  componentStack?: string | null;
  buildId?: string | null;
  /** Internal: API URL for drop/dedupe (not always sent to server). */
  _apiUrl?: string;
};

function readCsrfHeader(): Record<string, string> {
  if (typeof document === "undefined") return {};
  try {
    const m = document.cookie.match(/(?:^|; )blockminer_csrf=([^;]*)/);
    if (m) return { "x-csrf-token": decodeURIComponent(m[1]) };
  } catch {
    /* ignore */
  }
  return {};
}

function pageUrl(): string | null {
  try {
    return typeof window !== "undefined" ? String(window.location.href || "") : null;
  } catch {
    return null;
  }
}

function readBuildId(): string | null {
  if (typeof document === "undefined") return null;
  return document.querySelector('meta[name="bm-build"]')?.getAttribute("content") ?? null;
}

export function shouldDropClientTelemetry(payload: ClientTelemetryPayload): boolean {
  const code = payload.code ?? null;
  const status = payload.statusCode ?? null;
  const msg = String(payload.message || "");
  const category = payload.category === "api_failure" ? "api_failure" : "crash";

  if (code && CAPTCHA_CODES.has(code)) return true;
  if (code && GATE_CODES.has(code)) return true;
  if (code && AUTH_CODES.has(code)) return true;
  if (code && BENIGN_AUTO_MINING_CODES.has(code)) return true;
  if (category === "api_failure" && code && EXPECTED_CLIENT_UX_CODES.has(code)) return true;

  if (status === 401 || status === 429) return true;
  if (status === 502 || status === 504) return true;
  if (status != null && status >= 520 && status <= 524) return true;

  if (/human verification|captchaRequired|captcha (required|failed)|captcha.?disabled/i.test(msg)) {
    return true;
  }
  // Opaque cross-origin window.onerror (Zerads / ad iframes) — no stack.
  if (/^Script error\.?$/i.test(msg.trim())) return true;
  if (THIRD_PARTY_NOISE_TEXT.test(msg)) return true;
  // Axios transport failure with no HTTP status (deploy blip / offline).
  if (/^Network Error$/i.test(msg.trim()) && status == null) return true;
  if (/site em manuten|site.?maintenance|sistemas em manuten/i.test(msg)) return true;
  if (/session invalid|not authenticated|login required/i.test(msg)) return true;
  if (/timeout of \d+ms exceeded/i.test(msg)) return true;
  if (/request aborted|canceled|cancelled|abort/i.test(msg)) return true;
  if (/no session/i.test(msg)) return true;

  // Reown / WalletConnect explorer noise on /wallet
  if (
    (/^Failed to fetch$/i.test(msg.trim()) || /TypeError:\s*Failed to fetch/i.test(msg)) &&
    /fetchWallets|ConstantsUtil|@walletconnect|WalletConnect|reown/i.test(
      `${msg}\n${payload.stack ?? ""}\n${payload.componentStack ?? ""}`,
    )
  ) {
    return true;
  }

  if (category === "api_failure" && EXPECTED_CLIENT_API_FAILURE_TEXT.test(msg)) return true;
  if (
    category === "api_failure" &&
    status != null &&
    status >= 400 &&
    status < 500 &&
    EXPECTED_BUSINESS_RULE_TEXT.test(msg)
  ) {
    return true;
  }

  const apiUrl = payload._apiUrl || "";
  if (/\/api\/track\/client-error/.test(apiUrl)) return true;
  if (/\/api\/bm-captcha\//.test(apiUrl) && (status === 503 || code === "CAPTCHA_DISABLED")) {
    return true;
  }

  return false;
}

/**
 * The same HTTP failure is seen twice — once by the axios interceptor and once by the XHR
 * patch in client-error-collector-v5.js — so `operation` is deliberately NOT part of the key
 * for api_failure, and the window is shared with the collector via a window-level map.
 * Without this every API error was stored twice (axios_post + xhr_post).
 */
function dedupeKey(payload: ClientTelemetryPayload): string {
  const parts =
    payload.category === "api_failure"
      ? [payload.category, payload.message, payload.code, payload.statusCode, payload._apiUrl]
      : [payload.category, payload.operation, payload.message, payload.code, payload.statusCode];
  return parts.join("|").slice(0, 400);
}

type TelemetryWindow = Window & { __BM_CLIENT_ERROR_RECENT__?: Map<string, number> };

const fallbackRecent = new Map<string, number>();

function recentMap(): Map<string, number> {
  if (typeof window === "undefined") return fallbackRecent;
  const w = window as TelemetryWindow;
  if (!(w.__BM_CLIENT_ERROR_RECENT__ instanceof Map)) {
    w.__BM_CLIENT_ERROR_RECENT__ = new Map<string, number>();
  }
  return w.__BM_CLIENT_ERROR_RECENT__;
}

/** Bounded: the map lives on `window` for the whole SPA session. */
function pruneRecent(recent: Map<string, number>, now: number): void {
  if (recent.size <= 500) return;
  for (const [key, ts] of recent) {
    if (now - ts >= CLIENT_ERROR_TELEMETRY_DEDUPE_MS) recent.delete(key);
  }
}

/** Best-effort POST. Never throws. */
export function postClientErrorTelemetry(payload: ClientTelemetryPayload): void {
  try {
    if (shouldDropClientTelemetry(payload)) return;
    const key = dedupeKey(payload);
    const now = Date.now();
    const recent = recentMap();
    const prev = recent.get(key);
    if (prev != null && now - prev < CLIENT_ERROR_TELEMETRY_DEDUPE_MS) return;
    recent.set(key, now);
    pruneRecent(recent, now);

    const category = payload.category === "api_failure" ? "api_failure" : "crash";
    const body: Record<string, unknown> = {
      category,
      message: String(payload.message || "unknown").slice(0, 500),
      operation: payload.operation ?? null,
      statusCode: payload.statusCode ?? null,
      code: payload.code ?? null,
      requestId: payload.requestId ?? null,
      url: pageUrl(),
      stack: payload.stack ?? null,
      componentStack: payload.componentStack ?? null,
      buildId: payload.buildId ?? readBuildId(),
    };

    void fetch("/api/track/client-error", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...readCsrfHeader(),
      },
      body: JSON.stringify(body),
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* never let telemetry break the app */
  }
}

export function reportClientCrash(args: {
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  operation?: string;
}): void {
  postClientErrorTelemetry({
    category: "crash",
    message: args.message,
    operation: args.operation ?? "react_error_boundary",
    stack: args.stack ?? null,
    componentStack: args.componentStack ?? null,
  });
}

export type ReportApiFailureArgs = {
  operation: string;
  message: string;
  statusCode?: number;
  code?: string;
  context?: Record<string, unknown>;
  requestId?: string;
};

export function reportApiFailureViaTelemetry(args: ReportApiFailureArgs, err?: unknown): void {
  const extracted = extractApiFailureContext(err);
  const message = resolveApiFailureMessage(args.message, extracted);
  const statusCode = args.statusCode ?? extracted.statusCode;
  const code = args.code ?? extracted.code;
  const requestId = args.requestId ?? extracted.requestId;
  const context: Record<string, unknown> = {
    ...(args.context ?? {}),
    ...(extracted.method ? { method: extracted.method } : {}),
    ...(extracted.apiUrl ? { apiUrl: extracted.apiUrl } : {}),
    ...(extracted.bodySnippet ? { bodySnippet: extracted.bodySnippet } : {}),
    ...(extracted.responseMessage ? { responseMessage: extracted.responseMessage } : {}),
  };

  postClientErrorTelemetry({
    category: "api_failure",
    message,
    operation: args.operation,
    statusCode: statusCode ?? null,
    code: code ?? null,
    requestId: requestId ?? null,
    _apiUrl: extracted.apiUrl,
    stack: Object.keys(context).length > 0 ? JSON.stringify(context) : null,
  });
}
