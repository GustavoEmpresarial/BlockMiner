/**
 * Ported from legacy/server/modules/traffic/traffic.routes.ts (inline noise
 * filter + drop rules) and legacy/server/modules/traffic/clientErrors.admin.routes.ts
 * (CLIENT_ERROR_ACTIONS). No wallet/boosts errors here — traffic/ never credits a
 * reward, it is pure acquisition analytics + client telemetry ingestion.
 */

/** Third-party noise the client-error ingestion silently drops (never persisted). */
export const CLIENT_ERROR_NOISE: RegExp[] = [
  /** Opaque cross-origin `window.onerror` (iframes / ads) — no stack, not actionable. */
  /^Script error\.?$/i,
  /** Axios when the TCP/TLS connection drops (deploy recreate / brief outage) — no HTTP status. */
  /^Network Error$/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /\bblob:https?:\/\//i,
  /ss\.mrmnd\.com/i,
  /googletagmanager\.com/i,
  /google-analytics\.com/i,
  /doubleclick\.net/i,
  /facebook\.net/i,
  /dynamically imported module/i,
  /Loading chunk \d+ failed/i,
  /ChunkLoadError/i,
  /translate\.google\.com/i,
  /translate_a\/element\.js/i,
  /youtube\.com\/iframe_api/i,
  /infird\.com/i,
  /adtrafficquality\.google/i,
  /sodar2\.js/i,
  /zmstat\.com/i,
  /simple-ntr\.top/i,
  /blockminer\.space\/js\//i,
  /Script load failed:.*blockminer\.space\/(js|assets)\//i,
  /Failed to execute 'insertBefore'/i,
  /'removeChild'/i,
  /NotFoundError/i,
  /** Reown / WalletConnect explorer fetch failures (third-party API, not BM). */
  /fetchWallets(ByPage)?/i,
  /@walletconnect|WalletConnect|reown\.com|explorer-api\.walletconnect/i,
];

/**
 * WalletConnect / Reown lit components call explorer APIs; transient Failed to fetch
 * rejections are not BlockMiner defects (see admin client-errors from /wallet).
 */
export function isWalletConnectExplorerFetchNoise(
  message: string,
  stack: string | null | undefined,
): boolean {
  if (!/^Failed to fetch$/i.test(message.trim()) && !/TypeError:\s*Failed to fetch/i.test(message)) {
    return false;
  }
  const blob = `${message}\n${stack ?? ""}`;
  return /fetchWallets|ConstantsUtil|@walletconnect|WalletConnect|reown\.com|explorer-api\.walletconnect/i.test(
    blob,
  );
}

/** Business rules the UI already explains on screen — 4xx without a code, so named by text. */
export const EXPECTED_BUSINESS_RULE_TEXT =
  /insufficient|insuficiente|already (claimed|active|purchased)|cooldown|limit reached|limite|not eligible|sold out|esgotad|não tem ventiladores|nao tem ventiladores|não tem racks|nao tem racks|ventiladores disponíveis|racks disponíveis/i;

/**
 * Expected wait / UX copy that old clients still POST as api_failure.
 * CLAIM_NOT_DUE stall lines were the bulk of admin "Erros de cliente".
 */
export const EXPECTED_CLIENT_API_FAILURE_TEXT =
  /3\+ cycles with no grant \(last code: (CLAIM_NOT_DUE|PRESENCE_STALE|PRESENCE_INSUFFICIENT|SESSION_PAUSED|CONCURRENT_CLAIM|NO_SESSION)\)|Sessão ZerAds inválida|Nenhuma sessão ZerAds|Could not open the ZerAds/i;

/** Stall reports with these codes are scheduled waits, not defects. */
export const BENIGN_AUTO_MINING_STALL_CODES = new Set([
  "CLAIM_NOT_DUE",
  "PRESENCE_STALE",
  "PRESENCE_INSUFFICIENT",
  "SESSION_PAUSED",
  "CONCURRENT_CLAIM",
  "NO_SESSION",
]);

/** Expected human-verification / Turnstile outcomes — UI already blocked the action. */
export const EXPECTED_CAPTCHA_CODES = new Set([
  "CAPTCHA_REQUIRED",
  "CAPTCHA_FAILED",
  /** BM captcha master switch off (`BM_CAPTCHA_ENABLED=0`) — intentional, not a defect. */
  "CAPTCHA_DISABLED",
]);

export const EXPECTED_CAPTCHA_TEXT =
  /human verification|captchaRequired|captcha (required|failed)|captcha.?disabled|verification failed\. please try again/i;

/** Site/feature gates that are intentional UX, not defects. */
export const EXPECTED_GATE_CODES = new Set([
  "SITE_MAINTENANCE",
  "GATE_INACTIVE",
  "FEATURE_DISABLED",
  "SIDEBAR_HIDDEN",
  "CAPTCHA_DISABLED",
]);

export const EXPECTED_GATE_TEXT = /site em manuten[cç][aã]o|site.?maintenance|sistemas em manuten/i;

/** Auth/session probes from logged-out tabs — expected 401 noise. */
export const EXPECTED_AUTH_CODES = new Set([
  "ACCESS_MISSING",
  "UNAUTHORIZED",
  "SESSION_EXPIRED",
  "SESSION_SUPERSEDED",
]);

export const EXPECTED_AUTH_TEXT = /session invalid|not authenticated|login required/i;

/**
 * Expected UX / policy codes the product already explains on screen (toasts, gates).
 * Global axios/XHR collection would flood admin without these.
 */
export const EXPECTED_CLIENT_UX_CODES = new Set([
  "INVALID_STATE",
  // Vault 400s carry the specific reason instead of the generic INVALID_STATE above
  // (docs/vault-cofre-de-mineradores.md#api-contract). Ordinary user input — keep out
  // of the admin dashboard. Mirrored in clientErrorTelemetry.ts + collector-v4.
  "VAULT_INVALID_STATE",
  "VAULT_INVALID_SELECTION",
  "VAULT_INVALID_SLOT",
  "VAULT_INVALID_VAULT_ITEM",
  "VAULT_INVALID_RACK_REF",
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
]);

/**
 * Hand-patched SPA left users on mixed entry chunks (e.g. PeriodPills→54 + page→112).
 * React invalid-hook / null useContext stacks that cite two different inv2plus entries are cache noise.
 */
export function isStaleSpaDualReactStack(stack: string | null | undefined, message: string): boolean {
  const blob = `${message}\n${stack ?? ""}`;
  const m = blob.match(/index-inv2plus(\d+)/gi);
  if (!m || m.length < 2) return false;
  const versions = new Set(m.map((s) => s.replace(/index-inv2plus/i, "")));
  if (versions.size < 2) return false;
  return /Minified React error #321|Invalid hook call|Cannot read properties of null \(reading 'useContext'\)/i.test(
    message,
  );
}

/** Origin briefly unreachable (compose recreate / nginx upstream) — not product bugs. */
export const ORIGIN_GATEWAY_ERROR_STATUS_CODES = new Set([502, 504]);

/** AuditLog `action` values written by client-error ingestion, read back by admin listing. */
export const CLIENT_ERROR_ACTIONS = ["client_error_report", "client_api_failure"] as const;

function isNoise(s: string | null): boolean {
  return !!s && CLIENT_ERROR_NOISE.some((re) => re.test(s));
}

export type ClientErrorDropInput = {
  message: string;
  stack?: string | null;
  componentStack?: string | null;
  category: string;
  statusCode?: number | null;
  code?: string | null;
  operation?: string | null;
};

/** Cloudflare edge codes when origin is down / unreachable / reset — not app bugs. */
export const CLOUDFLARE_ORIGIN_ERROR_STATUS_CODES = new Set([520, 521, 522, 523, 524]);

/** Axios default abort copy — network/origin wedged, not a product defect. */
export const AXIOS_TIMEOUT_EXCEEDED_RE = /timeout of \d+ms exceeded/i;

/**
 * Pure drop rules — no I/O. Kept here so tests do not import traffic.service
 * (that file pulls Prisma).
 */
export function shouldDropClientError(body: ClientErrorDropInput, userAgent: string | null): boolean {
  const { message, stack, componentStack, category, statusCode, code, operation } = body;

  if (isNoise(message) || isNoise(stack ?? null) || isNoise(componentStack ?? null)) return true;
  if (isWalletConnectExplorerFetchNoise(message, stack ?? componentStack)) return true;
  if (isStaleSpaDualReactStack(stack ?? componentStack, message)) return true;
  if (/^\[object Object\]$/i.test(message.trim())) return true;
  if (category === "api_failure" && statusCode === 429) return true;
  if (
    category === "api_failure" &&
    statusCode != null &&
    CLOUDFLARE_ORIGIN_ERROR_STATUS_CODES.has(statusCode)
  ) {
    return true;
  }
  if (
    category === "api_failure" &&
    statusCode != null &&
    ORIGIN_GATEWAY_ERROR_STATUS_CODES.has(statusCode)
  ) {
    return true;
  }
  if (category === "api_failure" && /Request failed with status code 52[0-4]\b/i.test(message)) {
    return true;
  }
  if (category === "api_failure" && /Request failed with status code 502\b/i.test(message)) {
    return true;
  }
  if (category === "api_failure" && /Request failed with status code 504\b/i.test(message)) {
    return true;
  }
  if (category === "api_failure" && AXIOS_TIMEOUT_EXCEEDED_RE.test(message)) return true;
  if (category === "api_failure" && /no session/i.test(message)) return true;
  if (category === "api_failure" && /request aborted|canceled|cancelled|abort/i.test(message)) return true;
  if (category === "api_failure" && /bot|crawler|spider|headless|renderresources/i.test(userAgent ?? "")) return true;
  if (
    category === "api_failure" &&
    statusCode != null &&
    statusCode >= 400 &&
    statusCode < 500 &&
    EXPECTED_BUSINESS_RULE_TEXT.test(message)
  ) {
    return true;
  }
  if (category === "api_failure" && EXPECTED_CLIENT_API_FAILURE_TEXT.test(message)) return true;
  if (
    category === "api_failure" &&
    operation === "auto_mining_stalled" &&
    code != null &&
    BENIGN_AUTO_MINING_STALL_CODES.has(code)
  ) {
    return true;
  }
  if (category === "api_failure" && code != null && EXPECTED_CAPTCHA_CODES.has(code)) {
    return true;
  }
  if (category === "api_failure" && code != null && EXPECTED_GATE_CODES.has(code)) {
    return true;
  }
  if (category === "api_failure" && code != null && EXPECTED_AUTH_CODES.has(code)) {
    return true;
  }
  if (category === "api_failure" && code != null && EXPECTED_CLIENT_UX_CODES.has(code)) {
    return true;
  }
  if (
    category === "api_failure" &&
    statusCode === 401 &&
    (EXPECTED_AUTH_TEXT.test(message) || (code != null && EXPECTED_AUTH_CODES.has(code)))
  ) {
    return true;
  }
  if (
    category === "api_failure" &&
    statusCode === 503 &&
    (EXPECTED_GATE_TEXT.test(message) || (code != null && EXPECTED_GATE_CODES.has(code)))
  ) {
    return true;
  }
  if (
    category === "api_failure" &&
    statusCode != null &&
    statusCode >= 400 &&
    statusCode < 500 &&
    EXPECTED_CAPTCHA_TEXT.test(message)
  ) {
    return true;
  }
  if (
    category === "api_failure" &&
    statusCode === 400 &&
    /^Request failed with status code 400$/i.test(message) &&
    code != null &&
    EXPECTED_CAPTCHA_CODES.has(code)
  ) {
    return true;
  }
  return false;
}
