/**
 * k6 load test for Client Errors Telemetry Ingestion.
 *
 * Simulates high concurrency client crash / API failure reporting bursts.
 * Tests rate limiting resilience, database write overhead and response times.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5102").replace(/\/$/, "");
const VUS = Number(__ENV.VUS || 15);
const DURATION = __ENV.DURATION || "15s";

const serverErrors = new Rate("server_error_5xx");
const rateLimited = new Rate("rate_limited_429");
const durationTrend = new Trend("client_error_post_ms", true);
const totalRequests = new Counter("client_error_requests_total");

export const options = {
  scenarios: {
    client_error_burst: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "5s", target: VUS },
        { duration: "10s", target: VUS },
        { duration: "5s", target: 0 },
      ],
    },
  },
  thresholds: {
    server_error_5xx: ["rate==0"],
    client_error_post_ms: ["p(95)<1500"],
  },
};

export default function () {
  const payload = JSON.stringify({
    category: Math.random() > 0.5 ? "crash" : "api_failure",
    message: `k6 simulated client error #${Math.floor(Math.random() * 10000)}`,
    operation: "k6_load_test",
    statusCode: 500,
    code: "TEST_SIMULATED_ERROR",
    url: `${BASE_URL}/load-test`,
    fingerprint: `k6:simulated_error:${Math.floor(Math.random() * 50)}`,
    breadcrumbs: [
      { ts: Date.now() - 2000, type: "navigation", message: "nav_to:/dashboard" },
      { ts: Date.now() - 1000, type: "click", message: "click:button [Simulate]" },
    ],
    environment: {
      viewport: "1920x1080",
      connection: "4g",
      online: true,
    },
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "k6-load-tester/1.0",
    },
    timeout: "5s",
  };

  const res = http.post(`${BASE_URL}/api/track/client-error`, payload, params);

  totalRequests.add(1);
  durationTrend.add(res.timings.duration);

  const is5xx = res.status >= 500;
  const is429 = res.status === 429;
  serverErrors.add(is5xx);
  rateLimited.add(is429);

  check(res, {
    "status is 200 or 429 (rate-limited)": (r) => r.status === 200 || r.status === 429,
    "no 500 server crash": (r) => r.status < 500,
  });

  sleep(0.2);
}
