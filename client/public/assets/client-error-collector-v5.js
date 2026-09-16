/**
 * BlockMiner client-error collector v5 — v4 plus (15/09/2026):
 * - dedupe window shared with clientErrorTelemetry.ts, keyed without `operation`, so one
 *   HTTP failure is no longer stored twice (axios_post + xhr_post)
 * - third-party/browser noise drops (ResizeObserver loop, EIP-1193 disconnect, extensions)
 * - business codes observed flooding the admin panel (DAILY_LIMIT & co.)
 *
 * Renamed v4 -> v5 on purpose: /assets/ is served `immutable, 1y`, so a content-only change
 * would never reach a returning browser.
 */
(function () {
  "use strict";
  if (window.__BM_CLIENT_ERROR_COLLECTOR_V4__) return;
  window.__BM_CLIENT_ERROR_COLLECTOR_V4__ = true;

  var CAPTCHA_CODES = {
    CAPTCHA_REQUIRED: 1,
    CAPTCHA_FAILED: 1,
    CAPTCHA_DISABLED: 1,
  };
  var GATE_CODES = {
    SITE_MAINTENANCE: 1,
    GATE_INACTIVE: 1,
    FEATURE_DISABLED: 1,
    SIDEBAR_HIDDEN: 1,
    CAPTCHA_DISABLED: 1,
  };
  var AUTH_CODES = {
    ACCESS_MISSING: 1,
    UNAUTHORIZED: 1,
    SESSION_EXPIRED: 1,
    SESSION_SUPERSEDED: 1,
  };
  var BENIGN_CODES = {
    CLAIM_NOT_DUE: 1,
    PRESENCE_STALE: 1,
    PRESENCE_INSUFFICIENT: 1,
    SESSION_PAUSED: 1,
    CONCURRENT_CLAIM: 1,
    NO_SESSION: 1,
  };
  var UX_CODES = {
    INVALID_STATE: 1,
    INVALID_BODY: 1,
    INVALID_AMOUNT: 1,
    INVALID_TX_HASH: 1,
    INVALID_PURPOSE: 1,
    INVALID_PROVIDER: 1,
    INVALID_SOLUTION: 1,
    INVALID_CSRF_TOKEN: 1,
    INSUFFICIENT_BALANCE: 1,
    FAN_NO_CREDITS: 1,
    RACK_NO_CREDITS: 1,
    FAN_INSUFFICIENT_BALANCE: 1,
    RACK_INSUFFICIENT_BALANCE: 1,
    SHOP_INSUFFICIENT_BALANCE: 1,
    ALREADY_ACTIVE: 1,
    ALREADY_CLAIMED: 1,
    ALREADY_COLLECTED: 1,
    ALREADY_PAID: 1,
    ALREADY_SOLVED: 1,
    NOT_CLICKED: 1,
    NOT_COMPLETED: 1,
    NOT_STARTED: 1,
    NOT_LIVE: 1,
    VPN_PROXY_BLOCKED: 1,
    USERSCRIPT_MANAGER_BLOCKED: 1,
    ACCOUNT_LOCKED: 1,
    TOO_MANY_REQUESTS: 1,
    RATE_LIMIT_EXCEEDED: 1,
    TOO_MANY_ATTEMPTS: 1,
    IDEMPOTENT_REPLAY: 1,
    RACE_CONDITION_DETECTED: 1,
    BAD_PASSWORD: 1,
    // Business rules the UI already explains — they were flooding the admin panel.
    DAILY_LIMIT: 1,
    ADJACENT_RACK_OCCUPIED: 1,
    SESSION_NOT_ACTIVE: 1,
    USER_ALREADY_EXISTS: 1,
    EMAIL_PROVIDER_NOT_ALLOWED: 1,
    NO_REWARDS: 1,
    FAN_NEED_RACK: 1,
    BURN_NOT_READY: 1,
    SHORTLINK_NO_SESSION: 1,
    WALLET_ALREADY_LINKED: 1,
  };
  /**
   * Shared with clientErrorTelemetry.ts so the axios interceptor and the XHR patch below
   * do not store the same failure twice (axios_post + xhr_post duplicates).
   */
  if (!(window.__BM_CLIENT_ERROR_RECENT__ instanceof Map)) {
    window.__BM_CLIENT_ERROR_RECENT__ = new Map();
  }
  var recent = window.__BM_CLIENT_ERROR_RECENT__;
  /** Third-party / browser noise — see THIRD_PARTY_NOISE_TEXT in clientErrorTelemetry.ts */
  var THIRD_PARTY_NOISE_TEXT =
    /ResizeObserver loop (limit exceeded|completed with undelivered notifications)|provider is disconnected from all chains|Cannot redefine property|Extension context invalidated/i;
  /** Keep in sync with CLIENT_ERROR_TELEMETRY_DEDUPE_MS in clientErrorTelemetry.ts */
  var DEDUPE_MS = 15000;
  var BUSINESS_RULE_TEXT =
    /insufficient|insuficiente|already (claimed|active|purchased)|cooldown|limit reached|limite|not eligible|sold out|esgotad|não tem ventiladores|nao tem ventiladores|não tem racks|nao tem racks|ventiladores disponíveis|racks disponíveis/i;
  var EXPECTED_API_FAILURE_TEXT =
    /3\+ cycles with no grant \(last code: (CLAIM_NOT_DUE|PRESENCE_STALE|PRESENCE_INSUFFICIENT|SESSION_PAUSED|CONCURRENT_CLAIM|NO_SESSION)\)|Sessão ZerAds inválida|Nenhuma sessão ZerAds|Could not open the ZerAds/i;

  function csrfHeader() {
    try {
      var m = document.cookie.match(/(?:^|; )blockminer_csrf=([^;]*)/);
      if (m) return { "x-csrf-token": decodeURIComponent(m[1]) };
    } catch (e) {}
    return {};
  }

  function pageUrl() {
    try {
      return String(location.href || "");
    } catch (e) {
      return null;
    }
  }

  function readBuildId() {
    try {
      var el = document.querySelector('meta[name="bm-build"]');
      return el ? el.getAttribute("content") : null;
    } catch (e) {
      return null;
    }
  }

  function shouldDrop(payload) {
    var code = payload.code;
    var status = payload.statusCode;
    var msg = String(payload.message || "");
    var category = payload.category === "api_failure" ? "api_failure" : "crash";
    if (code && CAPTCHA_CODES[code]) return true;
    if (code && GATE_CODES[code]) return true;
    if (code && AUTH_CODES[code]) return true;
    if (code && BENIGN_CODES[code]) return true;
    if (category === "api_failure" && code && UX_CODES[code]) return true;
    if (status === 401) return true;
    if (status === 429) return true;
    if (status === 502 || status === 504) return true;
    if (status >= 520 && status <= 524) return true;
    if (/human verification|captchaRequired|captcha (required|failed)|captcha.?disabled/i.test(msg)) {
      return true;
    }
    if (THIRD_PARTY_NOISE_TEXT.test(msg)) return true;
    if (/site em manuten|site.?maintenance|sistemas em manuten/i.test(msg)) return true;
    if (/session invalid|not authenticated|login required/i.test(msg)) return true;
    if (/timeout of \d+ms exceeded/i.test(msg)) return true;
    if (/request aborted|canceled|cancelled|abort/i.test(msg)) return true;
    if (/no session/i.test(msg)) return true;
    if (
      (/^Failed to fetch$/i.test(msg.trim()) || /TypeError:\s*Failed to fetch/i.test(msg)) &&
      /fetchWallets|ConstantsUtil|@walletconnect|WalletConnect|reown/i.test(
        msg + "\n" + (payload.stack || "") + "\n" + (payload.componentStack || ""),
      )
    ) {
      return true;
    }
    if (category === "api_failure" && EXPECTED_API_FAILURE_TEXT.test(msg)) return true;
    if (
      category === "api_failure" &&
      status != null &&
      status >= 400 &&
      status < 500 &&
      BUSINESS_RULE_TEXT.test(msg)
    ) {
      return true;
    }
    var apiUrl = payload._apiUrl || "";
    if (/\/api\/track\/client-error/.test(apiUrl)) return true;
    if (/\/api\/bm-captcha\//.test(apiUrl) && (status === 503 || code === "CAPTCHA_DISABLED")) {
      return true;
    }
    return false;
  }

  function dedupeKey(payload) {
    // `operation` is intentionally excluded for api_failure: the same HTTP failure is seen
    // by both the axios interceptor (axios_*) and the XHR patch (xhr_*).
    var parts =
      payload.category === "api_failure"
        ? [payload.category, payload.message, payload.code, payload.statusCode, payload._apiUrl]
        : [payload.category, payload.operation, payload.message, payload.code, payload.statusCode];
    return parts.join("|").slice(0, 400);
  }

  function post(payload) {
    try {
      if (shouldDrop(payload)) return;
      var key = dedupeKey(payload);
      var now = Date.now();
      var prev = recent.get(key);
      if (prev != null && now - prev < DEDUPE_MS) return;
      recent.set(key, now);
      // Bounded: the map lives on `window` for the whole session.
      if (recent.size > 500) {
        recent.forEach(function (ts, k) {
          if (now - ts >= DEDUPE_MS) recent.delete(k);
        });
      }

      var rawCategory = payload.category || "crash";
      var category = rawCategory === "api_failure" ? "api_failure" : "crash";
      var body = {
        category: category,
        message: String(payload.message || "unknown").slice(0, 500),
        operation: payload.operation || null,
        statusCode: payload.statusCode != null ? payload.statusCode : null,
        code: payload.code || null,
        requestId: payload.requestId || null,
        url: pageUrl(),
        stack: payload.stack || null,
        componentStack: payload.componentStack || null,
        buildId: payload.buildId || readBuildId(),
      };
      fetch("/api/track/client-error", {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: Object.assign(
          { "Content-Type": "application/json", Accept: "application/json" },
          csrfHeader(),
        ),
        body: JSON.stringify(body),
      }).catch(function () {});
    } catch (e) {}
  }

  window.__BM_CLIENT_ERROR_COLLECTOR_SHOULD_DROP__ = shouldDrop;

  window.__BM_REPORT_CLIENT_CRASH__ = function (args) {
    args = args || {};
    post({
      category: "crash",
      operation: args.operation || "react_error_boundary",
      message: String(args.message || "unknown"),
      stack: args.stack || null,
      componentStack: args.componentStack || null,
    });
  };

  window.__BM_REPORT_API_FAILURE__ = function (args) {
    args = args || {};
    post({
      category: "api_failure",
      operation: args.operation || "api_failure",
      message: String(args.message || "unknown"),
      statusCode: args.statusCode != null ? args.statusCode : null,
      code: args.code || null,
      requestId: args.requestId || null,
      _apiUrl: args._apiUrl || args.apiUrl || "",
      stack: args.stack || null,
    });
  };

  function snippet(text, max) {
    var s = String(text || "");
    if (s.length <= max) return s;
    return s.slice(0, max) + "…";
  }

  function parseApiBody(text) {
    var code = null;
    var businessMsg = null;
    var requestId = null;
    try {
      var j = JSON.parse(text);
      if (j && typeof j === "object") {
        if (typeof j.code === "string") code = j.code;
        if (typeof j.message === "string") businessMsg = j.message;
        if (typeof j.requestId === "string") requestId = j.requestId;
      }
    } catch (e) {}
    return { code: code, businessMsg: businessMsg, requestId: requestId };
  }

  function isApiUrl(url) {
    return url && (url.indexOf("/api/") !== -1 || url.indexOf("/track/") !== -1);
  }

  try {
    window.addEventListener("error", function (ev) {
      var msg = (ev && ev.message) || "window.onerror";
      var stack = (ev && ev.error && ev.error.stack) || null;
      var src = ev && ev.filename ? String(ev.filename) : "";
      if (/chrome-extension:|moz-extension:|safari-extension:/i.test(src + msg)) return;
      if (/^(dollarSign|DollarSign|dollar-sign)$/i.test(String(msg).trim())) return;
      post({
        category: "crash",
        operation: "window_onerror",
        message: msg,
        stack: JSON.stringify({
          filename: src || null,
          lineno: ev && ev.lineno != null ? ev.lineno : null,
          colno: ev && ev.colno != null ? ev.colno : null,
          stack: stack,
        }),
      });
    });
  } catch (e) {}

  try {
    window.addEventListener("unhandledrejection", function (ev) {
      var reason = ev && ev.reason;
      var msg =
        reason && typeof reason === "object" && reason.message
          ? String(reason.message)
          : String(reason || "unhandledrejection");
      if (/^(dollarSign|DollarSign|dollar-sign)$/i.test(String(msg).trim())) return;
      var stack = reason && reason.stack ? String(reason.stack) : null;
      post({
        category: "crash",
        operation: "unhandledrejection",
        message: msg,
        stack: stack ? JSON.stringify({ stack: stack }) : null,
      });
    });
  } catch (e) {}

  try {
    var _fetch = window.fetch;
    if (typeof _fetch === "function") {
      window.fetch = function () {
        var args = arguments;
        var input = args[0];
        var init = args[1] || {};
        var method = String((init && init.method) || "GET").toUpperCase();
        var url = "";
        try {
          if (typeof input === "string") url = input;
          else if (input && typeof input.url === "string") url = input.url;
        } catch (e) {}
        return _fetch.apply(this, args).then(function (res) {
          try {
            if (!res || res.ok) return res;
            if (/\/api\/track\/client-error/.test(url)) return res;
            if (!isApiUrl(url)) return res;
            var status = res.status;
            res
              .clone()
              .text()
              .then(function (text) {
                var parsed = parseApiBody(text);
                var message =
                  parsed.businessMsg || parsed.code || "Request failed with status code " + status;
                var headerRequestId = null;
                try {
                  headerRequestId = res.headers && res.headers.get ? res.headers.get("x-request-id") : null;
                } catch (e) {}
                post({
                  category: "api_failure",
                  operation: "fetch_" + method.toLowerCase(),
                  message: message,
                  statusCode: status,
                  code: parsed.code,
                  requestId: parsed.requestId || headerRequestId,
                  _apiUrl: url,
                  stack: JSON.stringify({
                    method: method,
                    apiUrl: url,
                    statusCode: status,
                    code: parsed.code,
                    bodySnippet: snippet(text, 500),
                  }),
                });
              })
              .catch(function () {});
          } catch (e) {}
          return res;
        });
      };
    }
  } catch (e) {}

  try {
    var XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype) {
      var _open = XHR.prototype.open;
      var _send = XHR.prototype.send;
      XHR.prototype.open = function (method, url) {
        try {
          this.__bmMethod = String(method || "GET").toUpperCase();
          this.__bmUrl = url != null ? String(url) : "";
        } catch (e) {}
        return _open.apply(this, arguments);
      };
      XHR.prototype.send = function () {
        var xhr = this;
        try {
          xhr.addEventListener("loadend", function () {
            try {
              var url = String(xhr.__bmUrl || "");
              if (!isApiUrl(url)) return;
              if (/\/api\/track\/client-error/.test(url)) return;
              var status = xhr.status;
              if (!status || status < 400) return;
              var text = "";
              try {
                text = String(xhr.responseText || "");
              } catch (e) {}
              var parsed = parseApiBody(text);
              var method = String(xhr.__bmMethod || "GET").toUpperCase();
              var message =
                parsed.businessMsg || parsed.code || "Request failed with status code " + status;
              // The server sends correlation via the X-Request-Id response header, not the
              // body. Reading it here keeps the trace even when this collector wins the
              // dedupe race against the SPA's axios interceptor.
              var headerRequestId = null;
              try {
                headerRequestId = xhr.getResponseHeader("x-request-id") || null;
              } catch (e) {}
              post({
                category: "api_failure",
                operation: "xhr_" + method.toLowerCase(),
                message: message,
                statusCode: status,
                code: parsed.code,
                requestId: parsed.requestId || headerRequestId,
                _apiUrl: url,
                stack: JSON.stringify({
                  method: method,
                  apiUrl: url,
                  statusCode: status,
                  code: parsed.code,
                  bodySnippet: snippet(text, 500),
                }),
              });
            } catch (e) {}
          });
        } catch (e) {}
        return _send.apply(this, arguments);
      };
    }
  } catch (e) {}
})();
