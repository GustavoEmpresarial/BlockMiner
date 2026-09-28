/**
 * k6 load test for Admin Offerwall Analytics (/api/admin/offerwall/analytics).
 *
 * Simulates concurrent administrative analytics queries:
 * 1. Default date range (7 days)
 * 2. Extended date range (30 days)
 * 3. User-scoped analytics query (with userId param)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5124").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulAnalyticsQueries = new Rate("successful_analytics_queries");
const analyticsDurationTrend = new Trend("offerwall_analytics_duration_ms", true);
const totalRequests = new Counter("offerwall_analytics_requests_total");

export const options = {
  scenarios: {
    offerwall_analytics_traffic: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "3s", target: VUS },
        { duration: "6s", target: VUS },
        { duration: "2s", target: 0 },
      ],
    },
  },
  thresholds: {
    server_error_5xx: ["rate==0"],
    offerwall_analytics_duration_ms: ["p(95)<300"],
  },
};

export default function () {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (ADMIN_TOKEN) {
    headers["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    headers["Cookie"] = `bm_admin_session=${ADMIN_TOKEN}`;
  }

  // 1. Default query (last 7 days)
  const resDefault = http.get(`${BASE_URL}/api/admin/offerwall/analytics`, { headers });
  totalRequests.add(1);
  analyticsDurationTrend.add(resDefault.timings.duration);
  serverErrors.add(resDefault.status >= 500);
  successfulAnalyticsQueries.add(resDefault.status === 200 || resDefault.status === 429);
  check(resDefault, {
    "default analytics status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. Extended query (last 30 days)
  const now = new Date();
  const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const res30 = http.get(
    `${BASE_URL}/api/admin/offerwall/analytics?from=${past30.toISOString()}&to=${now.toISOString()}`,
    { headers },
  );
  totalRequests.add(1);
  analyticsDurationTrend.add(res30.timings.duration);
  serverErrors.add(res30.status >= 500);
  successfulAnalyticsQueries.add(res30.status === 200 || res30.status === 429);
  check(res30, {
    "30-day analytics status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 3. User-scoped query
  const resUser = http.get(`${BASE_URL}/api/admin/offerwall/analytics?userId=1`, { headers });
  totalRequests.add(1);
  analyticsDurationTrend.add(resUser.timings.duration);
  serverErrors.add(resUser.status >= 500);
  successfulAnalyticsQueries.add(resUser.status === 200 || resUser.status === 429);
  check(resUser, {
    "user-scoped analytics status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.05);
}
