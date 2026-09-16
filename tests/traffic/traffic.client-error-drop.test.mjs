import test from "node:test";
import assert from "node:assert/strict";

const { shouldDropClientError } = await import("../../server/modules/traffic/traffic.errors.ts");

function apiFailure(overrides = {}) {
  return {
    message: "",
    stack: null,
    componentStack: null,
    url: null,
    category: "api_failure",
    statusCode: null,
    buildId: null,
    code: null,
    operation: null,
    requestId: null,
    ...overrides,
  };
}

test("drops CLAIM_NOT_DUE stall lines that flooded admin", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        message: "3+ cycles with no grant (last code: CLAIM_NOT_DUE)",
        code: "CLAIM_NOT_DUE",
        operation: "auto_mining_stalled",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("drops stall reports by operation+code even if the message changes", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        message: "mining stalled",
        code: "PRESENCE_STALE",
        operation: "auto_mining_stalled",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("keeps unexpected stall codes", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        message: "3+ cycles with no grant (last code: WRONG_MODE)",
        code: "WRONG_MODE",
        operation: "auto_mining_stalled",
      }),
      "Mozilla/5.0",
    ),
    false,
  );
});

test("drops Cloudflare origin edge statuses 520-524", () => {
  assert.equal(
    shouldDropClientError(apiFailure({ statusCode: 520, message: "Request failed with status code 520" }), "Mozilla/5.0"),
    true,
  );
  assert.equal(
    shouldDropClientError(apiFailure({ statusCode: 522, message: "Request failed with status code 522" }), "Mozilla/5.0"),
    true,
  );
  assert.equal(
    shouldDropClientError(apiFailure({ message: "Request failed with status code 524" }), "Mozilla/5.0"),
    true,
  );
});

test("drops axios timeout exceeded as infra noise", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({ message: "timeout of 60000ms exceeded", operation: "auto_mining_claim" }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("keeps non-timeout api failures without CF status", () => {
  assert.equal(
    shouldDropClientError(apiFailure({ statusCode: 500, message: "Internal Server Error", operation: "auto_mining_claim" }), "Mozilla/5.0"),
    false,
  );
});

test("drops expected ZerAds UX copy", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({ message: "Sessão ZerAds inválida. Abra o link de novo e complete o captcha." }),
      "Mozilla/5.0",
    ),
    true,
  );
  assert.equal(
    shouldDropClientError(
      apiFailure({ message: "Nenhuma sessão ZerAds ativa. Clique em «Abrir Link ZerAds» e complete o captcha." }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("still drops 429 and aborted requests", () => {
  assert.equal(shouldDropClientError(apiFailure({ statusCode: 429, message: "rate limited" }), "Mozilla/5.0"), true);
  assert.equal(shouldDropClientError(apiFailure({ message: "canceled" }), "Mozilla/5.0"), true);
});

test("drops CAPTCHA_DISABLED when captcha master switch is off", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        statusCode: 503,
        message: "CAPTCHA_DISABLED",
        code: "CAPTCHA_DISABLED",
        operation: "fetch_post",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("drops ACCESS_MISSING / Session invalid 401 probes", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        statusCode: 401,
        message: "Session invalid.",
        code: "ACCESS_MISSING",
        operation: "fetch_get",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("drops origin gateway 502/504 blips", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({ statusCode: 502, message: "Request failed with status code 502", operation: "fetch_get" }),
      "Mozilla/5.0",
    ),
    true,
  );
  assert.equal(
    shouldDropClientError(
      apiFailure({ statusCode: 504, message: "Request failed with status code 504" }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("drops CAPTCHA_REQUIRED / CAPTCHA_FAILED by code", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        statusCode: 400,
        message: "Request failed with status code 400",
        code: "CAPTCHA_REQUIRED",
        operation: "auto_mining_start",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
  assert.equal(
    shouldDropClientError(
      apiFailure({ statusCode: 400, message: "Human verification failed. Please try again.", code: "CAPTCHA_FAILED" }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("drops captcha copy by message when status is 4xx", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        statusCode: 400,
        message: "Human verification is required before continuing.",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("keeps generic 400 without captcha or UX code", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({ statusCode: 400, message: "Request failed with status code 400", operation: "auto_mining_claim" }),
      "Mozilla/5.0",
    ),
    false,
  );
});

test("drops INVALID_STATE / VPN_PROXY_BLOCKED as expected UX", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        statusCode: 400,
        message: "Invalid slotIndex.",
        code: "INVALID_STATE",
        operation: "xhr_post",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
  assert.equal(
    shouldDropClientError(
      apiFailure({
        statusCode: 403,
        message: "VPN blocked",
        code: "VPN_PROXY_BLOCKED",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("drops SESSION_SUPERSEDED by auth code", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        statusCode: 401,
        message: "Session superseded",
        code: "SESSION_SUPERSEDED",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("drops SITE_MAINTENANCE / GATE_INACTIVE by code", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        statusCode: 503,
        message: "Request failed with status code 503",
        code: "SITE_MAINTENANCE",
        operation: "fetch_get",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
  assert.equal(
    shouldDropClientError(apiFailure({ statusCode: 403, message: "gate closed", code: "GATE_INACTIVE" }), "Mozilla/5.0"),
    true,
  );
  assert.equal(
    shouldDropClientError(apiFailure({ statusCode: 403, message: "hidden", code: "FEATURE_DISABLED" }), "Mozilla/5.0"),
    true,
  );
});

test("drops maintenance 503 copy even without code", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        statusCode: 503,
        message: "Site em manutenção. Tente novamente em breve.",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("keeps unexpected 503 without maintenance signal", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({ statusCode: 503, message: "upstream unavailable", operation: "auto_mining_claim" }),
      "Mozilla/5.0",
    ),
    false,
  );
});

test("drops extension / chunk noise via CLIENT_ERROR_NOISE", () => {
  assert.equal(
    shouldDropClientError(
      {
        message: "Script error.",
        stack: "chrome-extension://abc/content.js:1",
        componentStack: null,
        category: "crash",
      },
      "Mozilla/5.0",
    ),
    true,
  );
  assert.equal(
    shouldDropClientError(
      {
        message: "Loading chunk 12 failed",
        stack: null,
        componentStack: null,
        category: "crash",
      },
      "Mozilla/5.0",
    ),
    true,
  );
});


test("drops FAN_NO_CREDITS inventory UX", () => {
  assert.equal(
    shouldDropClientError(
      apiFailure({
        statusCode: 400,
        message: "Você não tem ventiladores disponíveis.",
        code: "FAN_NO_CREDITS",
        operation: "xhr_post",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
});

test("drops stale dual-React #321 when stack cites two inv2plus entries", () => {
  assert.equal(
    shouldDropClientError(
      {
        message: "Minified React error #321; visit https://react.dev/errors/321",
        stack: "at PeriodPills (https://blockminer.space/assets/index-inv2plus54.js)\nat page (https://blockminer.space/assets/index-inv2plus112.js)",
        componentStack: null,
        category: "crash",
        statusCode: null,
        code: null,
        operation: "root_error_boundary",
      },
      "Mozilla/5.0",
    ),
    true,
  );
});

test("drops useless [object Object] rejection messages", () => {
  assert.equal(
    shouldDropClientError(
      {
        message: "[object Object]",
        stack: null,
        componentStack: null,
        category: "crash",
        statusCode: null,
        code: null,
        operation: "unhandledrejection",
      },
      "Mozilla/5.0",
    ),
    true,
  );
});

test("drops WalletConnect explorer Failed to fetch noise", () => {
  assert.equal(
    shouldDropClientError(
      {
        message: "Failed to fetch",
        stack:
          "TypeError: Failed to fetch\n    at Object.fetchWallets (https://blockminer.space/assets/ConstantsUtil-inv2plus115.js:4:11818)",
        componentStack: null,
        category: "crash",
        statusCode: null,
        code: null,
        operation: "unhandledrejection",
      },
      "Mozilla/5.0",
    ),
    true,
  );
});

test("keeps generic Failed to fetch without WalletConnect stack", () => {
  assert.equal(
    shouldDropClientError(
      {
        message: "Failed to fetch",
        stack: "TypeError: Failed to fetch\n    at fetch (/api/wallet/balance)",
        componentStack: null,
        category: "crash",
        statusCode: null,
        code: null,
        operation: "unhandledrejection",
      },
      "Mozilla/5.0",
    ),
    false,
  );
});

// ── 15/09/2026 admin triage: what was actually in "Erros de cliente" ─────────────

function crash(overrides = {}) {
  return { ...apiFailure(overrides), category: "crash" };
}

test("drops browser/extension noise reported as a critical crash", () => {
  // 8 of the 15 "critical" rows were this Chrome notification, with no stack at all.
  assert.equal(
    shouldDropClientError(
      crash({
        message: "ResizeObserver loop completed with undelivered notifications.",
        url: "https://blockminer.space/dashboard",
      }),
      "Mozilla/5.0",
    ),
    true,
  );
  assert.equal(
    shouldDropClientError(crash({ message: "The provider is disconnected from all chains." }), "Mozilla/5.0"),
    true,
  );
  assert.equal(
    shouldDropClientError(crash({ message: "Uncaught TypeError: Cannot redefine property: message" }), "Mozilla/5.0"),
    true,
  );
});

test("drops business rules the UI already explains (1554 of 1685 rows)", () => {
  for (const code of [
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
  ]) {
    assert.equal(
      shouldDropClientError(apiFailure({ message: code, code, statusCode: 400 }), "Mozilla/5.0"),
      true,
      `expected ${code} to be dropped`,
    );
  }
});

test("keeps the real wallet-page crash and real 5xx", () => {
  assert.equal(
    shouldDropClientError(
      crash({
        message:
          "'get' on proxy: property 'on' is a read-only and non-configurable data property on the proxy target",
        url: "https://blockminer.space/wallet",
      }),
      "Mozilla/5.0",
    ),
    false,
  );
  assert.equal(
    shouldDropClientError(
      apiFailure({ message: "Erro ao obter estatísticas de indicações.", statusCode: 500 }),
      "Mozilla/5.0",
    ),
    false,
  );
});
