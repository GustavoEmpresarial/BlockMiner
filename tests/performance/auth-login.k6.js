/**
 * k6 load test for POST /api/auth/login — the account-takeover / brute-force
 * surface (security checklist categories: autenticação, brute force, rate
 * limiting, timing attack, user enumeration).
 *
 * SAFE BY DESIGN: every request uses a login identifier that does not exist
 * (a fresh random address per iteration), so every request takes the real
 * "user not found" rejection path (401 INVALID_CREDENTIALS) — the exact path
 * an attacker's credential-stuffing traffic would hit. It never
 * authenticates, never creates a session/refresh-token row, and never touches
 * a real account. This is deliberate: hammering login with VALID credentials
 * against a real shared staging DB would spam session/refresh-token rows and
 * risk tripping the real IP/account lockout for a real user sharing that IP.
 *
 * authLimiter (server/modules/auth/auth.routes.ts) caps this route at 24
 * requests/min per IP — from a single k6 client that ceiling dominates
 * everything past the first ~24 requests in a rolling minute, by design. This
 * test's thresholds are written around confirming that limiter actually
 * engages (not around raw throughput, which a single-IP test cannot measure
 * for a per-IP-limited route).
 *
 * Usage:
 *   k6 run -e BASE_URL=https://dev.blockminer.space tests/performance/auth-login.k6.js
 *   k6 run -e BASE_URL=https://dev.blockminer.space -e VUS=5 -e DURATION=20s tests/performance/auth-login.k6.js
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3001";
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || "20s";

const rateLimited = new Rate("rate_limited_429");
const invalidCreds = new Rate("invalid_credentials_401");
const serverErrors = new Rate("server_error_5xx");
const loginDuration = new Trend("login_response_time", true);
const totalRequests = new Counter("login_requests_total");

export const options = {
  scenarios: {
    login_load: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    // Never a crash/bug — either a clean rejection (401) or a clean rate-limit
    // (429) is fine; a 5xx is not.
    server_error_5xx: ["rate==0"],
    // The per-IP limiter (max 24/min) MUST actually engage under sustained
    // load from one source — if it never does, the limiter is broken/bypassed.
    rate_limited_429: ["rate>0"],
    http_req_duration: ["p(95)<800"],
  },
};

function randomEmail() {
  return `loadtest-nonexistent-${Date.now()}-${Math.floor(Math.random() * 1e9)}@gmail.com`;
}

/**
 * The app's CSRF middleware (server/core/http/middleware/csrf.ts) is a
 * double-submit cookie: any GET auto-issues a `blockminer_csrf` cookie, and
 * every mutating request must echo that exact value back as `X-CSRF-Token`.
 * A real client (SPA) reads the cookie and attaches the header itself; k6
 * has to do the same explicitly here, or every POST gets a 403
 * INVALID_CSRF_TOKEN before it ever reaches the login controller.
 */
function fetchCsrfToken() {
  const res = http.get(`${BASE_URL}/api/auth/session`);
  const cookie = (res.cookies && res.cookies.blockminer_csrf && res.cookies.blockminer_csrf[0]) || null;
  return cookie ? cookie.value : null;
}

export default function () {
  const csrfToken = fetchCsrfToken();
  const payload = JSON.stringify({
    identifier: randomEmail(),
    password: "WrongPassword123!NotReal",
  });
  const res = http.post(`${BASE_URL}/api/auth/login`, payload, {
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
  });

  totalRequests.add(1);
  loginDuration.add(res.timings.duration);
  rateLimited.add(res.status === 429);
  invalidCreds.add(res.status === 401);
  serverErrors.add(res.status >= 500);

  check(res, {
    "never a 5xx": (r) => r.status < 500,
    "is 401 (invalid creds) or 429 (rate limited) or 400 (captcha/validation)": (r) =>
      [400, 401, 429].includes(r.status),
  });
}
