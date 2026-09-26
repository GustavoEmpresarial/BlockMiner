/**
 * k6 load test for Faucet & Genesis Miner (Public & Admin).
 *
 * Simulates concurrent traffic:
 * 1. Public player queries on /api/faucet/status
 * 2. Administrative queries on /api/admin/faucet/config
 * 3. Administrative config updates on /api/admin/faucet/config
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5115").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulAdminQueries = new Rate("successful_admin_queries");
const successfulAdminUpdates = new Rate("successful_admin_updates");
const adminGetDurationTrend = new Trend("faucet_admin_get_ms", true);
const adminPutDurationTrend = new Trend("faucet_admin_put_ms", true);
const totalRequests = new Counter("faucet_requests_total");

export const options = {
  scenarios: {
    faucet_concurrent_traffic: {
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
    faucet_admin_get_ms: ["p(95)<300"],
    faucet_admin_put_ms: ["p(95)<500"],
  },
};

export default function (data) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (ADMIN_TOKEN) {
    headers["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    headers["Cookie"] = `bm_admin_session=${ADMIN_TOKEN}`;
  }

  // 1. Admin GET /api/admin/faucet/config
  const adminGetRes = http.get(`${BASE_URL}/api/admin/faucet/config`, { headers });
  totalRequests.add(1);
  adminGetDurationTrend.add(adminGetRes.timings.duration);
  serverErrors.add(adminGetRes.status >= 500);
  successfulAdminQueries.add(adminGetRes.status === 200);
  check(adminGetRes, {
    "admin faucet config status 200": (r) => r.status === 200,
  });

  // 2. Admin PUT /api/admin/faucet/config (simulated 20% of traffic)
  if (Math.random() < 0.2) {
    const putPayload = JSON.stringify({
      name: `Pulse Mini load-${__VU}`,
      baseHashRate: 30 + (__VU % 10),
      cooldownMs: 3600000,
    });

    const adminPutRes = http.put(`${BASE_URL}/api/admin/faucet/config`, putPayload, { headers });
    totalRequests.add(1);
    adminPutDurationTrend.add(adminPutRes.timings.duration);
    serverErrors.add(adminPutRes.status >= 500);
    successfulAdminUpdates.add(adminPutRes.status === 200);
    check(adminPutRes, {
      "admin faucet put status 200": (r) => r.status === 200,
    });
  }

  sleep(0.08);
}
