/**
 * k6 load test for Public Support endpoints:
 * 1. GET /api/public-support/tickets?email=test@test.com (Public endpoint)
 * 2. GET /api/admin/public-support/tickets (Admin endpoint with JWT)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5120").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulPublicQueries = new Rate("successful_public_queries");
const successfulAdminQueries = new Rate("successful_admin_queries");
const publicDurationTrend = new Trend("public_support_public_duration_ms", true);
const adminDurationTrend = new Trend("public_support_admin_duration_ms", true);
const totalRequests = new Counter("public_support_requests_total");

export const options = {
  scenarios: {
    public_support_traffic: {
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
    public_support_public_duration_ms: ["p(95)<300"],
    public_support_admin_duration_ms: ["p(95)<300"],
  },
};

export default function () {
  // 1. Public Support Tickets (GET /api/public-support/tickets?email=test@test.com)
  const pubRes = http.get(`${BASE_URL}/api/public-support/tickets?email=test@test.com`, {
    headers: { Accept: "application/json" },
  });
  totalRequests.add(1);
  publicDurationTrend.add(pubRes.timings.duration);
  serverErrors.add(pubRes.status >= 500);
  successfulPublicQueries.add(pubRes.status === 200);
  check(pubRes, {
    "public tickets status is 200": (r) => r.status === 200,
  });

  // 2. Admin Public Support Tickets (GET /api/admin/public-support/tickets)
  const adminHeaders = {
    Accept: "application/json",
  };
  if (ADMIN_TOKEN) {
    adminHeaders["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    adminHeaders["Cookie"] = `bm_admin_session=${ADMIN_TOKEN}`;
  }
  const adminRes = http.get(`${BASE_URL}/api/admin/public-support/tickets`, { headers: adminHeaders });
  totalRequests.add(1);
  adminDurationTrend.add(adminRes.timings.duration);
  serverErrors.add(adminRes.status >= 500);
  successfulAdminQueries.add(adminRes.status === 200 || adminRes.status === 429);
  check(adminRes, {
    "admin tickets status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });
}
