/**
 * k6 load test for Sidebar Nav endpoints:
 * 1. GET /api/sidebar/nav (Public endpoint queried by all players on dashboard load)
 * 2. GET /api/admin/sidebar-nav (Admin endpoint with categories, entries and itemMeta)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5118").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulPublicQueries = new Rate("successful_public_queries");
const successfulAdminQueries = new Rate("successful_admin_queries");
const publicDurationTrend = new Trend("sidebar_public_nav_duration_ms", true);
const adminDurationTrend = new Trend("sidebar_admin_nav_duration_ms", true);
const totalRequests = new Counter("sidebar_requests_total");

export const options = {
  scenarios: {
    sidebar_nav_traffic: {
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
    sidebar_public_nav_duration_ms: ["p(95)<200"],
    sidebar_admin_nav_duration_ms: ["p(95)<300"],
  },
};

export default function () {
  // 1. Public Sidebar Nav (GET /api/sidebar/nav)
  const pubRes = http.get(`${BASE_URL}/api/sidebar/nav`, {
    headers: { Accept: "application/json" },
  });
  totalRequests.add(1);
  publicDurationTrend.add(pubRes.timings.duration);
  serverErrors.add(pubRes.status >= 500);
  successfulPublicQueries.add(pubRes.status === 200);
  check(pubRes, {
    "public nav status is 200": (r) => r.status === 200,
  });

  // 2. Admin Sidebar Nav (GET /api/admin/sidebar-nav)
  const adminHeaders = {
    Accept: "application/json",
  };
  if (ADMIN_TOKEN) {
    adminHeaders["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    adminHeaders["Cookie"] = `bm_admin_session=${ADMIN_TOKEN}`;
  }
  const adminRes = http.get(`${BASE_URL}/api/admin/sidebar-nav`, { headers: adminHeaders });
  totalRequests.add(1);
  adminDurationTrend.add(adminRes.timings.duration);
  serverErrors.add(adminRes.status >= 500);
  successfulAdminQueries.add(adminRes.status === 200 || adminRes.status === 429);
  check(adminRes, {
    "admin nav status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });
}
