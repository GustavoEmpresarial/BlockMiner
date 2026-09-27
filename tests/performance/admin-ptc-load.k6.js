/**
 * k6 load test for PTC & Campaigns (Public & Admin).
 *
 * Simulates concurrent traffic:
 * 1. Public queries on /api/ptc/settings and /api/ptc/tiers
 * 2. Administrative queries on /api/admin/ptc/settings
 * 3. Administrative queries on /api/admin/ptc/campaigns/pending and /campaigns
 * 4. Administrative queries on /api/admin/ptc/tiers
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5120").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulPublicQueries = new Rate("successful_public_queries");
const successfulAdminQueries = new Rate("successful_admin_queries");

const publicGetDurationTrend = new Trend("ptc_public_get_ms", true);
const adminGetDurationTrend = new Trend("ptc_admin_get_ms", true);
const totalRequests = new Counter("ptc_requests_total");

export const options = {
  scenarios: {
    ptc_concurrent_traffic: {
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
    ptc_public_get_ms: ["p(95)<200"],
    ptc_admin_get_ms: ["p(95)<300"],
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

  // 1. Public GET /api/ptc/settings
  const publicRes = http.get(`${BASE_URL}/api/ptc/settings`, {
    headers: { Accept: "application/json" },
  });
  totalRequests.add(1);
  publicGetDurationTrend.add(publicRes.timings.duration);
  serverErrors.add(publicRes.status >= 500);
  successfulPublicQueries.add(publicRes.status === 200 || publicRes.status === 429);
  check(publicRes, {
    "public settings status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. Public GET /api/ptc/tiers
  const tiersRes = http.get(`${BASE_URL}/api/ptc/tiers`, {
    headers: { Accept: "application/json" },
  });
  totalRequests.add(1);
  publicGetDurationTrend.add(tiersRes.timings.duration);
  serverErrors.add(tiersRes.status >= 500);
  successfulPublicQueries.add(tiersRes.status === 200 || tiersRes.status === 429);
  check(tiersRes, {
    "public tiers status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });


  // 3. Admin GET /api/admin/ptc/campaigns/pending
  if (ADMIN_TOKEN) {
    const adminPendingRes = http.get(`${BASE_URL}/api/admin/ptc/campaigns/pending`, { headers });
    totalRequests.add(1);
    adminGetDurationTrend.add(adminPendingRes.timings.duration);
    serverErrors.add(adminPendingRes.status >= 500);
    successfulAdminQueries.add(adminPendingRes.status === 200);
    check(adminPendingRes, {
      "admin pending campaigns status 200": (r) => r.status === 200,
    });

    // 4. Admin GET /api/admin/ptc/tiers (30% probability)
    if (Math.random() < 0.3) {
      const adminTiersRes = http.get(`${BASE_URL}/api/admin/ptc/tiers`, { headers });
      totalRequests.add(1);
      adminGetDurationTrend.add(adminTiersRes.timings.duration);
      serverErrors.add(adminTiersRes.status >= 500);
      successfulAdminQueries.add(adminTiersRes.status === 200);
      check(adminTiersRes, {
        "admin tiers status 200": (r) => r.status === 200,
      });
    }
  }

  sleep(0.08);
}
