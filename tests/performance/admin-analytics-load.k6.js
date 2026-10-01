/**
 * k6 load test for Admin Analytics endpoints:
 * 1. GET /api/admin/stats
 * 2. GET /api/admin/analytics?period=month
 * 3. GET /api/admin/analytics/executive?period=week
 * 4. GET /api/admin/analytics/inflation?period=week
 * 5. GET /api/admin/analytics/projections?period=month
 * 6. GET /api/admin/analytics/withdrawals?period=month
 * 7. GET /api/admin/analytics/distribution?period=month
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5147").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulAdminQueries = new Rate("successful_admin_queries");

const statsDurationTrend = new Trend("admin_stats_duration_ms", true);
const overviewDurationTrend = new Trend("admin_analytics_overview_duration_ms", true);
const executiveDurationTrend = new Trend("admin_analytics_executive_duration_ms", true);
const inflationDurationTrend = new Trend("admin_analytics_inflation_duration_ms", true);
const projectionsDurationTrend = new Trend("admin_analytics_projections_duration_ms", true);
const withdrawalsDurationTrend = new Trend("admin_analytics_withdrawals_duration_ms", true);
const distributionDurationTrend = new Trend("admin_analytics_distribution_duration_ms", true);
const totalRequests = new Counter("analytics_requests_total");

export const options = {
  scenarios: {
    analytics_load: {
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
    admin_stats_duration_ms: ["p(95)<400"],
    admin_analytics_overview_duration_ms: ["p(95)<400"],
    admin_analytics_executive_duration_ms: ["p(95)<400"],
    admin_analytics_inflation_duration_ms: ["p(95)<400"],
    admin_analytics_projections_duration_ms: ["p(95)<400"],
    admin_analytics_withdrawals_duration_ms: ["p(95)<400"],
    admin_analytics_distribution_duration_ms: ["p(95)<400"],
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

  // 1. GET /api/admin/stats
  const resStats = http.get(`${BASE_URL}/api/admin/stats`, { headers: adminHeaders });
  totalRequests.add(1);
  statsDurationTrend.add(resStats.timings.duration);
  serverErrors.add(resStats.status >= 500);
  successfulAdminQueries.add(resStats.status === 200 || resStats.status === 429);
  check(resStats, { "stats status is 200 or 429": (r) => r.status === 200 || r.status === 429 });

  // 2. GET /api/admin/analytics?period=month
  const resOverview = http.get(`${BASE_URL}/api/admin/analytics?period=month`, { headers: adminHeaders });
  totalRequests.add(1);
  overviewDurationTrend.add(resOverview.timings.duration);
  serverErrors.add(resOverview.status >= 500);
  successfulAdminQueries.add(resOverview.status === 200 || resOverview.status === 429);
  check(resOverview, { "overview status is 200 or 429": (r) => r.status === 200 || r.status === 429 });

  // 3. GET /api/admin/analytics/executive?period=week
  const resExec = http.get(`${BASE_URL}/api/admin/analytics/executive?period=week`, { headers: adminHeaders });
  totalRequests.add(1);
  executiveDurationTrend.add(resExec.timings.duration);
  serverErrors.add(resExec.status >= 500);
  successfulAdminQueries.add(resExec.status === 200 || resExec.status === 429);
  check(resExec, { "executive status is 200 or 429": (r) => r.status === 200 || r.status === 429 });

  // 4. GET /api/admin/analytics/inflation?period=week
  const resInfl = http.get(`${BASE_URL}/api/admin/analytics/inflation?period=week`, { headers: adminHeaders });
  totalRequests.add(1);
  inflationDurationTrend.add(resInfl.timings.duration);
  serverErrors.add(resInfl.status >= 500);
  successfulAdminQueries.add(resInfl.status === 200 || resInfl.status === 429);
  check(resInfl, { "inflation status is 200 or 429": (r) => r.status === 200 || r.status === 429 });

  // 5. GET /api/admin/analytics/projections?period=month
  const resProj = http.get(`${BASE_URL}/api/admin/analytics/projections?period=month`, { headers: adminHeaders });
  totalRequests.add(1);
  projectionsDurationTrend.add(resProj.timings.duration);
  serverErrors.add(resProj.status >= 500);
  successfulAdminQueries.add(resProj.status === 200 || resProj.status === 429);
  check(resProj, { "projections status is 200 or 429": (r) => r.status === 200 || r.status === 429 });

  // 6. GET /api/admin/analytics/withdrawals?period=month
  const resWd = http.get(`${BASE_URL}/api/admin/analytics/withdrawals?period=month`, { headers: adminHeaders });
  totalRequests.add(1);
  withdrawalsDurationTrend.add(resWd.timings.duration);
  serverErrors.add(resWd.status >= 500);
  successfulAdminQueries.add(resWd.status === 200 || resWd.status === 429);
  check(resWd, { "withdrawals status is 200 or 429": (r) => r.status === 200 || r.status === 429 });

  // 7. GET /api/admin/analytics/distribution?period=month
  const resDist = http.get(`${BASE_URL}/api/admin/analytics/distribution?period=month`, { headers: adminHeaders });
  totalRequests.add(1);
  distributionDurationTrend.add(resDist.timings.duration);
  serverErrors.add(resDist.status >= 500);
  successfulAdminQueries.add(resDist.status === 200 || resDist.status === 429);
  check(resDist, { "distribution status is 200 or 429": (r) => r.status === 200 || r.status === 429 });
}
