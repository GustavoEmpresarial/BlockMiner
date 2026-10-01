/**
 * k6 load test for Admin Traffic endpoints:
 * 1. GET /api/admin/traffic/summary?days=30
 * 2. GET /api/admin/traffic/by-domain?days=30
 * 3. GET /api/admin/traffic/by-utm?days=30
 * 4. GET /api/admin/traffic/daily?days=30
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5141").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulAdminQueries = new Rate("successful_admin_queries");
const summaryDurationTrend = new Trend("admin_traffic_summary_duration_ms", true);
const domainDurationTrend = new Trend("admin_traffic_domain_duration_ms", true);
const utmDurationTrend = new Trend("admin_traffic_utm_duration_ms", true);
const dailyDurationTrend = new Trend("admin_traffic_daily_duration_ms", true);
const totalRequests = new Counter("traffic_requests_total");

export const options = {
  scenarios: {
    traffic_analysis: {
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
    admin_traffic_summary_duration_ms: ["p(95)<300"],
    admin_traffic_domain_duration_ms: ["p(95)<300"],
    admin_traffic_utm_duration_ms: ["p(95)<300"],
    admin_traffic_daily_duration_ms: ["p(95)<300"],
  },
};

export default function () {
  const adminHeaders = {
    Accept: "application/json",
  };
  if (ADMIN_TOKEN) {
    adminHeaders["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    adminHeaders["Cookie"] = `blockminer_admin_session=${ADMIN_TOKEN}`;
  }

  // 1. GET /api/admin/traffic/summary?days=30
  const resSummary = http.get(`${BASE_URL}/api/admin/traffic/summary?days=30`, { headers: adminHeaders });
  totalRequests.add(1);
  summaryDurationTrend.add(resSummary.timings.duration);
  serverErrors.add(resSummary.status >= 500);
  successfulAdminQueries.add(resSummary.status === 200 || resSummary.status === 429);
  check(resSummary, {
    "traffic summary status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. GET /api/admin/traffic/by-domain?days=30
  const resDomain = http.get(`${BASE_URL}/api/admin/traffic/by-domain?days=30`, { headers: adminHeaders });
  totalRequests.add(1);
  domainDurationTrend.add(resDomain.timings.duration);
  serverErrors.add(resDomain.status >= 500);
  successfulAdminQueries.add(resDomain.status === 200 || resDomain.status === 429);
  check(resDomain, {
    "traffic by-domain status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 3. GET /api/admin/traffic/by-utm?days=30
  const resUtm = http.get(`${BASE_URL}/api/admin/traffic/by-utm?days=30`, { headers: adminHeaders });
  totalRequests.add(1);
  utmDurationTrend.add(resUtm.timings.duration);
  serverErrors.add(resUtm.status >= 500);
  successfulAdminQueries.add(resUtm.status === 200 || resUtm.status === 429);
  check(resUtm, {
    "traffic by-utm status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 4. GET /api/admin/traffic/daily?days=30
  const resDaily = http.get(`${BASE_URL}/api/admin/traffic/daily?days=30`, { headers: adminHeaders });
  totalRequests.add(1);
  dailyDurationTrend.add(resDaily.timings.duration);
  serverErrors.add(resDaily.status >= 500);
  successfulAdminQueries.add(resDaily.status === 200 || resDaily.status === 429);
  check(resDaily, {
    "traffic daily status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });
}
