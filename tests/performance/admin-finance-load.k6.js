/**
 * k6 load test for Admin Finance & Hot Wallet endpoints.
 *
 * Simulates concurrent administrative queries on:
 * 1. GET /api/admin/wallet/hot-wallet (balance, queue coverage, cooldown)
 * 2. GET /api/admin/wallet/withdrawals/pending (withdrawal queue)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5117").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulHotWalletQueries = new Rate("successful_hot_wallet_queries");
const successfulPendingQueries = new Rate("successful_pending_queries");
const hotWalletDurationTrend = new Trend("finance_hot_wallet_query_ms", true);
const pendingDurationTrend = new Trend("finance_pending_query_ms", true);
const totalRequests = new Counter("finance_requests_total");

export const options = {
  scenarios: {
    finance_concurrent_traffic: {
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
    finance_hot_wallet_query_ms: ["p(95)<300"],
    finance_pending_query_ms: ["p(95)<400"],
  },
};

export default function () {
  const headers = {
    Accept: "application/json",
  };
  if (ADMIN_TOKEN) {
    headers["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    headers["Cookie"] = `bm_admin_session=${ADMIN_TOKEN}`;
  }

  // 1. Hot Wallet Status (GET /api/admin/wallet/hot-wallet)
  const hwRes = http.get(`${BASE_URL}/api/admin/wallet/hot-wallet`, { headers });
  totalRequests.add(1);
  hotWalletDurationTrend.add(hwRes.timings.duration);
  serverErrors.add(hwRes.status >= 500);
  successfulHotWalletQueries.add(hwRes.status === 200);
  check(hwRes, {
    "hot-wallet status 200": (r) => r.status === 200,
  });

  // 2. Pending Withdrawals Queue (GET /api/admin/wallet/withdrawals/pending)
  const queueRes = http.get(`${BASE_URL}/api/admin/wallet/withdrawals/pending`, { headers });
  totalRequests.add(1);
  pendingDurationTrend.add(queueRes.timings.duration);
  serverErrors.add(queueRes.status >= 500);
  successfulPendingQueries.add(queueRes.status === 200);
  check(queueRes, {
    "pending withdrawals status 200": (r) => r.status === 200,
  });

  sleep(0.08);
}
