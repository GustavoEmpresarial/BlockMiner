/**
 * k6 load test for POST /api/auth/register.
 *
 * SAFE BY DEFAULT: this test sends a deliberately-rejected payload — an email
 * domain outside REGISTER_ALLOWED_EMAIL_DOMAINS (registerAllowedEmailDomains.js
 * only allows gmail/outlook/hotmail/yahoo/icloud/proton/tuta) — so every
 * request is rejected by zod validation (400) before any DB write, same as
 * the real bot/abuse traffic this endpoint constantly receives with disposable
 * domains. It exercises the real validation + rate-limiter code path without
 * ever creating an account.
 *
 * Registering a REAL account on every load-test iteration against a shared
 * staging DB would permanently pollute the users table (no cleanup path) and
 * is never done by default here. A separate, explicitly opt-in scenario below
 * (REAL_REGISTER=1) exists for the rare case someone wants to validate the
 * full happy path end-to-end — it is capped at a handful of iterations and
 * tags every created account so it can be found and deleted afterward.
 *
 * authLimiter caps /register at 24 requests/min per IP, same as /login — see
 * tests/performance/auth-login.k6.js for why thresholds are built around
 * confirming the limiter engages, not raw throughput.
 *
 * Usage:
 *   k6 run -e BASE_URL=https://dev.blockminer.space tests/performance/auth-register.k6.js
 *
 *   # Opt-in only — creates REAL accounts, must be manually cleaned up after:
 *   #   DELETE FROM users WHERE email LIKE 'loadtest-real-%@gmail.com';
 *   k6 run -e BASE_URL=https://dev.blockminer.space -e REAL_REGISTER=1 -e VUS=1 -e ITERATIONS=3 \
 *     tests/performance/auth-register.k6.js
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3001";
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || "20s";
const REAL_REGISTER = __ENV.REAL_REGISTER === "1";
const REAL_ITERATIONS = Number(__ENV.ITERATIONS || 3);

const rateLimited = new Rate("rate_limited_429");
const validationRejected = new Rate("validation_rejected_400");
const serverErrors = new Rate("server_error_5xx");
const registerDuration = new Trend("register_response_time", true);

export const options = REAL_REGISTER
  ? {
      scenarios: {
        real_register: {
          executor: "shared-iterations",
          vus: Math.min(VUS, 2),
          iterations: REAL_ITERATIONS,
          maxDuration: "60s",
        },
      },
      thresholds: {
        server_error_5xx: ["rate==0"],
      },
    }
  : {
      scenarios: {
        register_load: {
          executor: "constant-vus",
          vus: VUS,
          duration: DURATION,
        },
      },
      thresholds: {
        server_error_5xx: ["rate==0"],
        // Every request in the default (safe) mode uses a disallowed email
        // domain, so validation must reject essentially all of them — this
        // confirms the fast-reject path holds up under load, before it ever
        // reaches the rate limiter or the DB.
        validation_rejected_400: ["rate>0.5"],
        http_req_duration: ["p(95)<800"],
      },
    };

function safeRejectedPayload() {
  const tag = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return {
    username: `loadtest_${tag}`.slice(0, 24),
    // example.com is never in REGISTER_ALLOWED_EMAIL_DOMAINS — always rejected.
    email: `loadtest-${tag}@example.com`,
    password: "LoadTestPassword123!",
    acceptTerms: true,
  };
}

function realAccountPayload() {
  const tag = `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  return {
    // Clearly tagged so it can be found and deleted: DELETE FROM users WHERE
    // email LIKE 'loadtest-real-%@gmail.com';
    username: `loadtestreal${tag}`.slice(0, 24),
    email: `loadtest-real-${tag}@gmail.com`,
    password: "LoadTestPassword123!",
    acceptTerms: true,
  };
}

/**
 * Double-submit CSRF cookie (server/core/http/middleware/csrf.ts): a GET
 * auto-issues `blockminer_csrf`, and every mutating request must echo it back
 * as `X-CSRF-Token`, or it 403s (INVALID_CSRF_TOKEN) before validation even runs.
 */
function fetchCsrfToken() {
  const res = http.get(`${BASE_URL}/api/auth/session`);
  const cookie = (res.cookies && res.cookies.blockminer_csrf && res.cookies.blockminer_csrf[0]) || null;
  return cookie ? cookie.value : null;
}

export default function () {
  const csrfToken = fetchCsrfToken();
  const payload = JSON.stringify(REAL_REGISTER ? realAccountPayload() : safeRejectedPayload());
  const res = http.post(`${BASE_URL}/api/auth/register`, payload, {
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken || "" },
  });

  registerDuration.add(res.timings.duration);
  rateLimited.add(res.status === 429);
  validationRejected.add(res.status === 400);
  serverErrors.add(res.status >= 500);

  check(res, {
    "never a 5xx": (r) => r.status < 500,
  });
}
