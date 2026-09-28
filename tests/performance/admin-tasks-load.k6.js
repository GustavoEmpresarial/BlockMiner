/**
 * k6 load test for Daily Tasks & Missions (User Dashboard & Admin Definitions).
 *
 * Simulates concurrent traffic:
 * 1. User queries on /api/daily-tasks (Dashboard)
 * 2. Administrative queries on /api/admin/daily-tasks/definitions
 * 3. User claims /api/daily-tasks/:taskId/claim
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5122").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const USER_TOKEN = __ENV.USER_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulUserQueries = new Rate("successful_user_queries");
const successfulAdminQueries = new Rate("successful_admin_queries");

const userGetDurationTrend = new Trend("tasks_user_get_ms", true);
const adminGetDurationTrend = new Trend("tasks_admin_get_ms", true);
const totalRequests = new Counter("tasks_requests_total");

export const options = {
  scenarios: {
    tasks_concurrent_traffic: {
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
    tasks_user_get_ms: ["p(95)<200"],
    tasks_admin_get_ms: ["p(95)<300"],
  },
};

export default function () {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  // 1. User Dashboard GET /api/daily-tasks
  const userHeaders = { ...headers };
  if (USER_TOKEN) {
    userHeaders["Cookie"] = `bm_access=${USER_TOKEN}; bm_token=${USER_TOKEN}`;
    userHeaders["Authorization"] = `Bearer ${USER_TOKEN}`;
  }

  const userRes = http.get(`${BASE_URL}/api/daily-tasks`, { headers: userHeaders });
  totalRequests.add(1);
  userGetDurationTrend.add(userRes.timings.duration);
  serverErrors.add(userRes.status >= 500);
  successfulUserQueries.add(userRes.status === 200 || userRes.status === 401 || userRes.status === 429);
  check(userRes, {
    "user dashboard status 200 or 401 or 429": (r) => r.status === 200 || r.status === 401 || r.status === 429,
  });

  // 2. Admin GET /api/admin/daily-tasks/definitions
  const adminHeaders = { ...headers };
  if (ADMIN_TOKEN) {
    adminHeaders["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    adminHeaders["Cookie"] = `bm_admin_session=${ADMIN_TOKEN}`;
  }

  const adminRes = http.get(`${BASE_URL}/api/admin/daily-tasks/definitions`, { headers: adminHeaders });
  totalRequests.add(1);
  adminGetDurationTrend.add(adminRes.timings.duration);
  serverErrors.add(adminRes.status >= 500);
  successfulAdminQueries.add(adminRes.status === 200 || adminRes.status === 401 || adminRes.status === 403 || adminRes.status === 429);
  check(adminRes, {
    "admin definitions status 200 or 401/403/429": (r) =>
      r.status === 200 || r.status === 401 || r.status === 403 || r.status === 429,
  });

  // 3. User POST /api/daily-tasks/:taskId/claim
  const claimRes = http.post(`${BASE_URL}/api/daily-tasks/1/claim`, "{}", { headers: userHeaders });
  totalRequests.add(1);
  userGetDurationTrend.add(claimRes.timings.duration);
  serverErrors.add(claimRes.status >= 500);
  check(claimRes, {
    "user claim status handled gracefully (< 500)": (r) => r.status < 500,
  });

  sleep(0.05);
}
