/**
 * k6 load test for authenticated Dashboard GET endpoints.
 * Target: localhost only. Fails immediately if pointed at production/staging domains.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5137").replace(/\/$/, "");

// Strict environment barrier
if (
  BASE_URL.includes("blockminer.space") ||
  BASE_URL.includes("dev.blockminer.space") ||
  BASE_URL.includes("staging.blockminer.space")
) {
  throw new Error("SECURITY GUARD TRIGGERED: Load tests are strictly prohibited against remote/production domains! Target must be localhost.");
}

const VUS = Number(__ENV.VUS || 3);
const DURATION = __ENV.DURATION || "15s";
const AUTH_TOKEN = __ENV.AUTH_TOKEN || "";
const EMAIL = __ENV.LOADTEST_EMAIL || "";
const PASSWORD = __ENV.LOADTEST_PASSWORD || "";

const serverErrors = new Rate("server_error_5xx");
const authFailed = new Rate("auth_failed");
const walletMs = new Trend("dashboard_wallet_ms", true);
const cycleMs = new Trend("dashboard_cycle_ms", true);
const slotsMs = new Trend("dashboard_slots_ms", true);
const feeMs = new Trend("dashboard_fee_ms", true);
const bannersMs = new Trend("dashboard_banners_ms", true);
const energyTaxMs = new Trend("dashboard_energy_tax_ms", true);
const total = new Counter("dashboard_requests_total");

export const options = {
  scenarios: {
    dashboard_load: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    server_error_5xx: ["rate==0"],
    auth_failed: ["rate<0.05"],
    dashboard_wallet_ms: ["p(95)<1000"],
    dashboard_cycle_ms: ["p(95)<1000"],
    dashboard_slots_ms: ["p(95)<1000"],
    dashboard_banners_ms: ["p(95)<1000"],
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

export function setup() {
  if (AUTH_TOKEN) {
    return { token: AUTH_TOKEN, cookie: `access_token=${AUTH_TOKEN}` };
  }

  if (!EMAIL || !PASSWORD) {
    throw new Error("AUTH_TOKEN or (LOADTEST_EMAIL and LOADTEST_PASSWORD) required for dashboard load test");
  }

  const session = http.get(`${BASE_URL}/api/auth/session`);
  const csrf =
    (session.cookies && session.cookies.blockminer_csrf && session.cookies.blockminer_csrf[0] &&
      session.cookies.blockminer_csrf[0].value) ||
    "";
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
    throw new Error(`login failed status=${login.status} body=${String(login.body).slice(0, 200)}`);
  }
  const cookie = [cookieHeaderFromResponse(session), cookieHeaderFromResponse(login)]
    .filter(Boolean)
    .join("; ");
  return { cookie, csrf };
}

export default function (data) {
  const headers = {
    Cookie: data.cookie || (data.token ? `access_token=${data.token}` : ""),
    Authorization: data.token ? `Bearer ${data.token}` : "",
    "X-CSRF-Token": data.csrf || "",
  };

  const paths = [
    { path: "/api/wallet/balance", trend: walletMs },
    { path: "/api/mining/cycle", trend: cycleMs },
    { path: "/api/rooms/slots", trend: slotsMs },
    { path: "/api/wallet/withdraw-fee-info", trend: feeMs },
    { path: "/api/banners", trend: bannersMs },
    { path: "/api/energy-tax/summary", trend: energyTaxMs },
  ];

  for (const p of paths) {
    const res = http.get(`${BASE_URL}${p.path}`, { headers });
    total.add(1);
    p.trend.add(res.timings.duration);
    serverErrors.add(res.status >= 500);
    authFailed.add(res.status === 401 || res.status === 403);
    check(res, {
      [`${p.path} not 5xx`]: (r) => r.status < 500,
      [`${p.path} is 200`]: (r) => r.status === 200,
    });
  }
  sleep(0.5);
}
