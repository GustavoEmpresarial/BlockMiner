/**
 * k6 load test for Admin Burn Events (/api/admin/burn-events*).
 *
 * Simulates concurrent administrative traffic:
 * 1. Admin burn events list (/api/admin/burn-events)
 * 2. Admin claims history list (/api/admin/burn-events/1/claims)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5135").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulQueries = new Rate("successful_queries");
const durationTrend = new Trend("burn_events_duration_ms", true);
const totalRequests = new Counter("burn_events_requests_total");

export const options = {
  scenarios: {
    burn_events_traffic: {
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
    burn_events_duration_ms: ["p(95)<250"],
  },
};

export default function () {
  const adminHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    Cookie: `bm_admin_session=${ADMIN_TOKEN}`,
  };

  // 1. Admin list burn events
  const resEvents = http.get(`${BASE_URL}/api/admin/burn-events`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resEvents.timings.duration);
  serverErrors.add(resEvents.status >= 500);
  successfulQueries.add(resEvents.status === 200 || resEvents.status === 429);
  check(resEvents, {
    "list burn events status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. Admin list claims for event #1
  const resClaims = http.get(`${BASE_URL}/api/admin/burn-events/1/claims?page=1`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resClaims.timings.duration);
  serverErrors.add(resClaims.status >= 500);
  successfulQueries.add(resClaims.status === 200 || resClaims.status === 404 || resClaims.status === 429);
  check(resClaims, {
    "list event claims status 200/404/429": (r) => r.status === 200 || r.status === 404 || r.status === 429,
  });

  sleep(0.05);
}
