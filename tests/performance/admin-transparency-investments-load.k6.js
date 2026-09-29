/**
 * k6 load test for Admin Transparency External Investments (/api/admin/transparency/external-investments).
 *
 * Simulates concurrent administrative and public traffic:
 * 1. Admin external investments list (/api/admin/transparency/external-investments)
 * 2. Public external investments list (/api/transparency/external-investments)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5136").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulQueries = new Rate("successful_queries");
const durationTrend = new Trend("transparency_investments_duration_ms", true);
const totalRequests = new Counter("transparency_investments_requests_total");

export const options = {
  scenarios: {
    transparency_investments_traffic: {
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
    transparency_investments_duration_ms: ["p(95)<250"],
  },
};

export default function () {
  const adminHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    Cookie: `bm_admin_session=${ADMIN_TOKEN}`,
  };

  // 1. Admin list external investments
  const resAdmin = http.get(`${BASE_URL}/api/admin/transparency/external-investments`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resAdmin.timings.duration);
  serverErrors.add(resAdmin.status >= 500);
  successfulQueries.add(resAdmin.status === 200 || resAdmin.status === 429);
  check(resAdmin, {
    "admin list status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. Public list external investments
  const resPublic = http.get(`${BASE_URL}/api/transparency/external-investments`, {
    headers: { Accept: "application/json" },
  });
  totalRequests.add(1);
  durationTrend.add(resPublic.timings.duration);
  serverErrors.add(resPublic.status >= 500);
  successfulQueries.add(resPublic.status === 200 || resPublic.status === 429);
  check(resPublic, {
    "public list status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.05);
}
