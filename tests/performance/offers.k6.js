/**
 * Load test for /offers + admin Ofertas — read path only.
 *
 * Measures the real work, not the 401 reject path:
 *   GET /offers                              SPA
 *   GET /api/offer-events/active             player (requireAuth + listLimiter + DB)
 *   GET /api/admin/offer-events?pageSize=100 admin list (aggregation)
 *   GET .../miners and .../purchases         manage tab, if the list returns an id
 *
 * No purchase POST. listLimiter on /active is 120/min per ip+user — the ramp
 * crosses that on purpose so we can see 429 vs query slowness.
 *
 * Mirrors `DEFAULT_HTTP_SLOW_REQUEST_MS` (server httpRequestLogger). Override
 * with HTTP_SLOW_REQUEST_MS.
 *
 *   LOADTEST_EMAIL / LOADTEST_PASSWORD              required
 *   LOADTEST_ADMIN_EMAIL + LOADTEST_ADMIN_SECURITY_CODE
 *     (+ optional LOADTEST_ADMIN_PASSWORD)          optional admin
 *
 *   k6 run tests/performance/offers.k6.js
 *   k6 run -e BASE_URL=http://127.0.0.1:5173 tests/performance/offers.k6.js
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const EMAIL = __ENV.LOADTEST_EMAIL || "";
const PASSWORD = __ENV.LOADTEST_PASSWORD || "";
const ADMIN_EMAIL = __ENV.LOADTEST_ADMIN_EMAIL || "";
const ADMIN_SECURITY_CODE = __ENV.LOADTEST_ADMIN_SECURITY_CODE || "";
const ADMIN_PASSWORD = __ENV.LOADTEST_ADMIN_PASSWORD || ADMIN_SECURITY_CODE;

/** Same default as `server/core/http/middleware/httpRequestLogger.ts`. */
const DEFAULT_HTTP_SLOW_REQUEST_MS = 1000;
const SLOW_MS = Number(__ENV.HTTP_SLOW_REQUEST_MS || DEFAULT_HTTP_SLOW_REQUEST_MS);

/** Same as `ADMIN_OFFER_EVENTS_LIST_PAGE_SIZE_MAX` / client list. */
const ADMIN_LIST_PAGE_SIZE = 100;
/** Same as `ADMIN_OFFER_EVENT_PURCHASES_PAGE_SIZE` on the manage tab. */
const ADMIN_PURCHASES_PAGE_SIZE = 200;

const PEAK_ITERS_PER_SEC = Number(__ENV.PEAK_ITERS_PER_SEC || 5);
const RAMP_UP = __ENV.RAMP_UP || "20s";
const HOLD = __ENV.HOLD || "40s";
const OVER_HOLD = __ENV.OVER_HOLD || "20s";
const RAMP_DOWN = __ENV.RAMP_DOWN || "10s";
const PREALLOC_VUS = Number(__ENV.PREALLOC_VUS || 16);
const MAX_VUS = Number(__ENV.MAX_VUS || 32);

const serverErrors = new Rate("server_error_5xx");
const authFailed = new Rate("auth_failed");
const rateLimited = new Rate("offers_429");
const activeOk = new Rate("offers_active_200");
const slowActive = new Rate("offers_active_slow");

const spaMs = new Trend("offers_spa_ms", true);
const spaWait = new Trend("offers_spa_waiting_ms", true);
const activeMs = new Trend("offers_active_ms", true);
const activeWait = new Trend("offers_active_waiting_ms", true);
const adminListMs = new Trend("admin_list_ms", true);
const adminListWait = new Trend("admin_list_waiting_ms", true);
const adminMinersMs = new Trend("admin_miners_ms", true);
const adminPurchasesMs = new Trend("admin_purchases_ms", true);
const total = new Counter("offers_requests_total");

export const options = {
  scenarios: {
    offers_ramp: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1s",
      preAllocatedVUs: PREALLOC_VUS,
      maxVUs: MAX_VUS,
      stages: [
        { duration: RAMP_UP, target: 1 },
        { duration: HOLD, target: 2 },
        { duration: OVER_HOLD, target: PEAK_ITERS_PER_SEC },
        { duration: RAMP_DOWN, target: 0 },
      ],
    },
  },
  thresholds: {
    server_error_5xx: ["rate==0"],
    auth_failed: ["rate<0.02"],
    offers_active_waiting_ms: [`p(95)<${SLOW_MS}`],
    offers_spa_waiting_ms: [`p(95)<${SLOW_MS}`],
  },
};

function cookieHeaderFromResponse(res) {
  const parts = [];
  const jar = res.cookies || {};
  for (const name of Object.keys(jar)) {
    const arr = jar[name];
    if (arr && arr[0] && arr[0].value) parts.push(`${name}=${arr[0].value}`);
  }
  return parts.join("; ");
}

function mergeCookies(...responses) {
  return responses.map(cookieHeaderFromResponse).filter(Boolean).join("; ");
}

function csrfFrom(res) {
  return (
    (res.cookies &&
      res.cookies.blockminer_csrf &&
      res.cookies.blockminer_csrf[0] &&
      res.cookies.blockminer_csrf[0].value) ||
    ""
  );
}

function record(res, durationTrend, waitingTrend) {
  total.add(1);
  serverErrors.add(res.status >= 500);
  rateLimited.add(res.status === 429);
  if (durationTrend) durationTrend.add(res.timings.duration);
  if (waitingTrend) waitingTrend.add(res.timings.waiting);
}

export function setup() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("LOADTEST_EMAIL and LOADTEST_PASSWORD are required (player session for GET /active)");
  }

  const session = http.get(`${BASE_URL}/api/auth/session`);
  const csrf = csrfFrom(session);
  const login = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
    },
  );
  if (login.status !== 200) {
    throw new Error(`player login failed status=${login.status} body=${String(login.body).slice(0, 200)}`);
  }
  const cookie = mergeCookies(session, login);
  const playerCsrf = csrfFrom(login) || csrf;

  let adminCookie = "";
  let adminCsrf = playerCsrf;
  let eventId = 0;

  if (ADMIN_EMAIL && ADMIN_SECURITY_CODE) {
    const adminSession = http.get(`${BASE_URL}/api/admin/auth/check`);
    adminCsrf = csrfFrom(adminSession) || playerCsrf;
    const adminLogin = http.post(
      `${BASE_URL}/api/admin/auth/login`,
      JSON.stringify({
        email: ADMIN_EMAIL,
        securityCode: ADMIN_SECURITY_CODE,
        password: ADMIN_PASSWORD,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": adminCsrf,
          Cookie: mergeCookies(adminSession),
        },
      },
    );
    if (adminLogin.status !== 200) {
      throw new Error(
        `admin login failed status=${adminLogin.status} body=${String(adminLogin.body).slice(0, 200)}`,
      );
    }
    adminCookie = mergeCookies(adminSession, adminLogin);
    adminCsrf = csrfFrom(adminLogin) || adminCsrf;

    const list = http.get(`${BASE_URL}/api/admin/offer-events?pageSize=${ADMIN_LIST_PAGE_SIZE}`, {
      headers: { Cookie: adminCookie, "X-CSRF-Token": adminCsrf },
    });
    if (list.status === 200) {
      try {
        const body = JSON.parse(String(list.body || "{}"));
        const first = Array.isArray(body.events) && body.events[0] ? body.events[0].id : 0;
        eventId = Number(first) || 0;
      } catch {
        eventId = 0;
      }
    }
  }

  return { cookie, csrf: playerCsrf, adminCookie, adminCsrf, eventId };
}

export default function (data) {
  const playerHeaders = {
    Cookie: data.cookie || "",
    "X-CSRF-Token": data.csrf || "",
    Accept: "application/json",
  };

  const spa = http.get(`${BASE_URL}/offers`, { headers: { Accept: "text/html" } });
  record(spa, spaMs, spaWait);
  check(spa, {
    "GET /offers HTML 200": (r) => r.status === 200 && String(r.body).includes("<!"),
  });

  const active = http.get(`${BASE_URL}/api/offer-events/active`, { headers: playerHeaders });
  record(active, activeMs, activeWait);
  authFailed.add(active.status === 401 || active.status === 403);
  activeOk.add(active.status === 200);
  slowActive.add(active.timings.waiting >= SLOW_MS);
  check(active, {
    "GET /active is 200 or 429": (r) => r.status === 200 || r.status === 429,
    "GET /active 200 has ok": (r) => r.status !== 200 || String(r.body).includes('"ok":true'),
  });

  if (!data.adminCookie) return;

  const adminHeaders = {
    Cookie: data.adminCookie,
    "X-CSRF-Token": data.adminCsrf || "",
    Accept: "application/json",
  };

  const list = http.get(`${BASE_URL}/api/admin/offer-events?pageSize=${ADMIN_LIST_PAGE_SIZE}`, {
    headers: adminHeaders,
  });
  record(list, adminListMs, adminListWait);
  authFailed.add(list.status === 401 || list.status === 403);
  check(list, {
    "GET /admin/offer-events is 200": (r) => r.status === 200,
  });

  if (!data.eventId) return;

  const miners = http.get(`${BASE_URL}/api/admin/offer-events/${data.eventId}/miners`, {
    headers: adminHeaders,
  });
  record(miners, adminMinersMs, null);
  check(miners, { "GET admin miners not 5xx": (r) => r.status < 500 });

  const purchases = http.get(
    `${BASE_URL}/api/admin/offer-events/${data.eventId}/purchases?pageSize=${ADMIN_PURCHASES_PAGE_SIZE}`,
    { headers: adminHeaders },
  );
  record(purchases, adminPurchasesMs, null);
  check(purchases, { "GET admin purchases not 5xx": (r) => r.status < 500 });
}

export function handleSummary(data) {
  const lines = [];
  const pick = (name) => data.metrics[name] || {};
  const val = (metric, key) => {
    const v = metric.values && metric.values[key];
    return typeof v === "number" ? v : null;
  };
  const fmt = (n) => (n == null ? "—" : `${n.toFixed(1)}ms`);

  const rows = [
    ["SPA /offers", "offers_spa_ms", "offers_spa_waiting_ms"],
    ["GET /active (player)", "offers_active_ms", "offers_active_waiting_ms"],
    ["GET admin list", "admin_list_ms", "admin_list_waiting_ms"],
    ["GET admin miners", "admin_miners_ms", null],
    ["GET admin purchases", "admin_purchases_ms", null],
  ];

  lines.push("offers load — duration vs waiting (TTFB / server think)");
  lines.push(`slow bar HTTP_SLOW_REQUEST_MS=${SLOW_MS}`);
  lines.push("endpoint                         p50 dur   p95 dur   p99 dur   p95 wait  p99 wait");
  const ranked = [];
  for (const [label, durName, waitName] of rows) {
    const dur = pick(durName);
    if (!dur.values) continue;
    const wait = waitName ? pick(waitName) : {};
    const p95w = waitName ? val(wait, "p(95)") : val(dur, "p(95)");
    ranked.push({ label, p95w: p95w || 0 });
    lines.push(
      `${label.padEnd(32)} ${fmt(val(dur, "p(50)")).padStart(8)} ${fmt(val(dur, "p(95)")).padStart(9)} ${fmt(val(dur, "p(99)")).padStart(9)} ${fmt(val(wait, "p(95)")).padStart(9)} ${fmt(val(wait, "p(99)")).padStart(9)}`,
    );
  }
  ranked.sort((a, b) => b.p95w - a.p95w);
  if (ranked.length) {
    const top = ranked[0];
    const flag = top.p95w >= SLOW_MS ? "SLOW" : "ok";
    lines.push(`worst p95 wait: ${top.label} ${fmt(top.p95w)} [${flag}]`);
  }

  const r429 = val(pick("offers_429"), "rate");
  const r5xx = val(pick("server_error_5xx"), "rate");
  const r200 = val(pick("offers_active_200"), "rate");
  const rSlow = val(pick("offers_active_slow"), "rate");
  lines.push(
    `active 200=${r200 == null ? "—" : (r200 * 100).toFixed(1) + "%"}  429=${r429 == null ? "—" : (r429 * 100).toFixed(1) + "%"}  5xx=${r5xx == null ? "—" : (r5xx * 100).toFixed(1) + "%"}  wait>=${SLOW_MS}ms ${rSlow == null ? "—" : (rSlow * 100).toFixed(1) + "%"}`,
  );

  const text = `${lines.join("\n")}\n`;
  return {
    stdout: `\n${text}\n`,
    "offers-k6-summary.txt": text,
  };
}
