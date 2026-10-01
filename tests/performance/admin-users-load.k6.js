/**
 * k6 load test for Admin Users endpoints:
 * 1. GET /api/admin/users (All users)
 * 2. GET /api/admin/users?status=active (Active users)
 * 3. GET /api/admin/users/1 (User detail)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5132").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulAdminQueries = new Rate("successful_admin_queries");
const usersListDurationTrend = new Trend("admin_users_list_duration_ms", true);
const userDetailDurationTrend = new Trend("admin_user_detail_duration_ms", true);
const totalRequests = new Counter("users_requests_total");

export const options = {
  scenarios: {
    users_traffic: {
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
    admin_users_list_duration_ms: ["p(95)<300"],
    admin_user_detail_duration_ms: ["p(95)<300"],
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

  // 1. GET /api/admin/users
  const resList = http.get(`${BASE_URL}/api/admin/users`, { headers: adminHeaders });
  totalRequests.add(1);
  usersListDurationTrend.add(resList.timings.duration);
  serverErrors.add(resList.status >= 500);
  successfulAdminQueries.add(resList.status === 200 || resList.status === 429);
  check(resList, {
    "users list status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. GET /api/admin/users?status=active
  const resActive = http.get(`${BASE_URL}/api/admin/users?status=active`, { headers: adminHeaders });
  totalRequests.add(1);
  usersListDurationTrend.add(resActive.timings.duration);
  serverErrors.add(resActive.status >= 500);
  successfulAdminQueries.add(resActive.status === 200 || resActive.status === 429);
  check(resActive, {
    "users active status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 3. GET /api/admin/users/1
  const resDetail = http.get(`${BASE_URL}/api/admin/users/1`, { headers: adminHeaders });
  totalRequests.add(1);
  userDetailDurationTrend.add(resDetail.timings.duration);
  serverErrors.add(resDetail.status >= 500);
  successfulAdminQueries.add(resDetail.status === 200 || resDetail.status === 404 || resDetail.status === 429);
  check(resDetail, {
    "user detail status is expected": (r) => r.status === 200 || r.status === 404 || r.status === 429,
  });
}
