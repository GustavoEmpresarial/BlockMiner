/**
 * k6 load test for Tournaments Module (Public & Admin).
 *
 * Simulates concurrent player queries on /api/tournaments and
 * administrative queries on /api/admin/tournaments.
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5107").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulPublicQueries = new Rate("successful_public_200");
const successfulAdminQueries = new Rate("successful_admin_queries");
const publicDurationTrend = new Trend("tournaments_public_query_ms", true);
const adminDurationTrend = new Trend("tournaments_admin_query_ms", true);
const totalRequests = new Counter("tournaments_requests_total");

export const options = {
  scenarios: {
    tournaments_concurrent_traffic: {
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
    tournaments_public_query_ms: ["p(95)<400"],
    tournaments_admin_query_ms: ["p(95)<600"],
  },
};

export default function () {
  const headers = {
    Accept: "application/json",
  };
  if (ADMIN_TOKEN) {
    headers["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    headers["Cookie"] = `blockminer_admin_session=${ADMIN_TOKEN}`;
  }

  // 1. Player Tournament Hub Query (Public: GET /api/tournaments)
  const publicRes = http.get(`${BASE_URL}/api/tournaments`, { headers });
  totalRequests.add(1);
  publicDurationTrend.add(publicRes.timings.duration);
  serverErrors.add(publicRes.status >= 500);
  successfulPublicQueries.add(publicRes.status === 200 || publicRes.status === 429);
  check(publicRes, {
    "public tournaments status valid (200 or 429 rate-limited)": (r) =>
      r.status === 200 || r.status === 429,
  });

  // 2. Admin Tournaments List Query (GET /api/admin/tournaments)
  const adminRes = http.get(`${BASE_URL}/api/admin/tournaments`, { headers });
  totalRequests.add(1);
  adminDurationTrend.add(adminRes.timings.duration);
  serverErrors.add(adminRes.status >= 500);
  successfulAdminQueries.add(
    adminRes.status === 200 || adminRes.status === 401 || adminRes.status === 429,
  );
  check(adminRes, {
    "admin tournaments status valid (200, 401 or 429)": (r) =>
      r.status === 200 || r.status === 401 || r.status === 429,
  });

  // 3. Admin Display Order Query (GET /api/admin/tournaments/display-order)
  const orderRes = http.get(`${BASE_URL}/api/admin/tournaments/display-order`, { headers });
  totalRequests.add(1);
  adminDurationTrend.add(orderRes.timings.duration);
  serverErrors.add(orderRes.status >= 500);
  check(orderRes, {
    "admin display order status valid (200, 401 or 429)": (r) =>
      r.status === 200 || r.status === 401 || r.status === 429,
  });

  sleep(0.1);
}
