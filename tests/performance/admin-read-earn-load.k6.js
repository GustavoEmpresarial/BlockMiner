/**
 * k6 load test for Read & Earn (Public & Admin).
 *
 * Simulates concurrent traffic:
 * 1. Public player queries on /api/read-earn/campaigns
 * 2. Administrative queries on /api/admin/read-earn/campaigns
 * 3. Administrative redemptions queries on /api/admin/read-earn/campaigns/:id/redemptions
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5118").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulPublicQueries = new Rate("successful_public_queries");
const successfulAdminQueries = new Rate("successful_admin_queries");
const successfulRedemptionsQueries = new Rate("successful_redemptions_queries");

const publicGetDurationTrend = new Trend("read_earn_public_get_ms", true);
const adminGetDurationTrend = new Trend("read_earn_admin_get_ms", true);
const adminRedemptionsDurationTrend = new Trend("read_earn_admin_redemptions_ms", true);
const totalRequests = new Counter("read_earn_requests_total");

export const options = {
  scenarios: {
    read_earn_concurrent_traffic: {
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
    read_earn_public_get_ms: ["p(95)<200"],
    read_earn_admin_get_ms: ["p(95)<300"],
    read_earn_admin_redemptions_ms: ["p(95)<300"],
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

  // 1. Public GET /api/read-earn/campaigns
  const publicRes = http.get(`${BASE_URL}/api/read-earn/campaigns`, {
    headers: { Accept: "application/json" },
  });
  totalRequests.add(1);
  publicGetDurationTrend.add(publicRes.timings.duration);
  serverErrors.add(publicRes.status >= 500);
  successfulPublicQueries.add(publicRes.status === 200);
  check(publicRes, {
    "public campaigns status 200": (r) => r.status === 200,
  });

  // 2. Admin GET /api/admin/read-earn/campaigns
  if (ADMIN_TOKEN) {
    const adminGetRes = http.get(`${BASE_URL}/api/admin/read-earn/campaigns`, { headers });
    totalRequests.add(1);
    adminGetDurationTrend.add(adminGetRes.timings.duration);
    serverErrors.add(adminGetRes.status >= 500);
    successfulAdminQueries.add(adminGetRes.status === 200);
    check(adminGetRes, {
      "admin read-earn campaigns status 200": (r) => r.status === 200,
    });

    // 3. Admin GET /api/admin/read-earn/campaigns/1/redemptions (if available)
    if (Math.random() < 0.3) {
      const redemptionsRes = http.get(
        `${BASE_URL}/api/admin/read-earn/campaigns/1/redemptions?skip=0&take=50`,
        { headers },
      );
      totalRequests.add(1);
      adminRedemptionsDurationTrend.add(redemptionsRes.timings.duration);
      serverErrors.add(redemptionsRes.status >= 500);
      // Status 200 or 404 (if ID 1 not present) are acceptable non-5xx statuses
      successfulRedemptionsQueries.add(redemptionsRes.status === 200 || redemptionsRes.status === 404);
      check(redemptionsRes, {
        "admin redemptions non-5xx": (r) => r.status < 500,
      });
    }
  }

  sleep(0.08);
}
