/**
 * k6 load test for Admin Support & Player Support endpoints:
 * 1. GET /api/admin/support (Admin list tickets)
 * 2. GET /api/admin/support?archived=1 (Admin list archived tickets)
 * 3. GET /api/support (Player list tickets)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5124").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const USER_TOKEN = __ENV.USER_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulAdminQueries = new Rate("successful_admin_queries");
const successfulPlayerQueries = new Rate("successful_player_queries");
const adminDurationTrend = new Trend("admin_support_list_duration_ms", true);
const playerDurationTrend = new Trend("player_support_list_duration_ms", true);
const totalRequests = new Counter("support_requests_total");

export const options = {
  scenarios: {
    support_traffic: {
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
    admin_support_list_duration_ms: ["p(95)<300"],
    player_support_list_duration_ms: ["p(95)<300"],
  },
};

export default function () {
  // 1. Admin Support Tickets (GET /api/admin/support)
  const adminHeaders = {
    Accept: "application/json",
  };
  if (ADMIN_TOKEN) {
    adminHeaders["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    adminHeaders["Cookie"] = `bm_admin_session=${ADMIN_TOKEN}`;
  }
  const adminRes = http.get(`${BASE_URL}/api/admin/support`, { headers: adminHeaders });
  totalRequests.add(1);
  adminDurationTrend.add(adminRes.timings.duration);
  serverErrors.add(adminRes.status >= 500);
  successfulAdminQueries.add(adminRes.status === 200 || adminRes.status === 429);
  check(adminRes, {
    "admin support status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. Admin Support Archived Tickets (GET /api/admin/support?archived=1)
  const archivedRes = http.get(`${BASE_URL}/api/admin/support?archived=1`, { headers: adminHeaders });
  totalRequests.add(1);
  adminDurationTrend.add(archivedRes.timings.duration);
  serverErrors.add(archivedRes.status >= 500);
  successfulAdminQueries.add(archivedRes.status === 200 || archivedRes.status === 429);
  check(archivedRes, {
    "admin support archived status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 3. Player Support Tickets (GET /api/support)
  const userHeaders = {
    Accept: "application/json",
  };
  if (USER_TOKEN) {
    userHeaders["Authorization"] = `Bearer ${USER_TOKEN}`;
  }
  const userRes = http.get(`${BASE_URL}/api/support`, { headers: userHeaders });
  totalRequests.add(1);
  playerDurationTrend.add(userRes.timings.duration);
  serverErrors.add(userRes.status >= 500);
  successfulPlayerQueries.add(userRes.status === 200 || userRes.status === 429 || userRes.status === 401);
  check(userRes, {
    "player support status is expected": (r) => r.status === 200 || r.status === 429 || r.status === 401,
  });
}
