/**
 * k6 load test for Mini Pass (/api/mini-pass & /api/admin/mini-pass).
 *
 * Simulates concurrent administrative and player traffic:
 * 1. Admin seasons list (/api/admin/mini-pass/seasons)
 * 2. Admin season detail with level rewards and missions (/api/admin/mini-pass/seasons/1)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5132").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulQueries = new Rate("successful_queries");
const durationTrend = new Trend("mini_pass_duration_ms", true);
const totalRequests = new Counter("mini_pass_requests_total");

export const options = {
  scenarios: {
    mini_pass_traffic: {
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
    mini_pass_duration_ms: ["p(95)<250"],
  },
};

export default function () {
  const adminHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    Cookie: `bm_admin_session=${ADMIN_TOKEN}`,
  };

  // 1. Admin list seasons
  const resSeasons = http.get(`${BASE_URL}/api/admin/mini-pass/seasons`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resSeasons.timings.duration);
  serverErrors.add(resSeasons.status >= 500);
  successfulQueries.add(resSeasons.status === 200 || resSeasons.status === 429);
  check(resSeasons, {
    "list seasons status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. Admin get season detail
  const resDetail = http.get(`${BASE_URL}/api/admin/mini-pass/seasons/1`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resDetail.timings.duration);
  serverErrors.add(resDetail.status >= 500);
  successfulQueries.add(resDetail.status === 200 || resDetail.status === 404 || resDetail.status === 429);
  check(resDetail, {
    "get season detail status ok/404 or 429": (r) => r.status === 200 || r.status === 404 || r.status === 429,
  });

  sleep(0.05);
}
