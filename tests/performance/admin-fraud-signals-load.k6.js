/**
 * k6 load test for Fraud Signals endpoints:
 * 1. GET /api/admin/fraud-signals (All scope)
 * 2. GET /api/admin/fraud-signals?scope=ips (IPs scope)
 * 3. GET /api/admin/fraud-signals?scope=devices (Devices scope)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5129").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulAdminQueries = new Rate("successful_admin_queries");
const fraudListDurationTrend = new Trend("admin_fraud_signals_duration_ms", true);
const totalRequests = new Counter("fraud_signals_requests_total");

export const options = {
  scenarios: {
    fraud_signals_traffic: {
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
    admin_fraud_signals_duration_ms: ["p(95)<300"],
  },
};

export default function () {
  const adminHeaders = {
    Accept: "application/json",
  };
  if (ADMIN_TOKEN) {
    adminHeaders["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    adminHeaders["Cookie"] = `bm_admin_session=${ADMIN_TOKEN}`;
  }

  // 1. GET /api/admin/fraud-signals (All scope)
  const resAll = http.get(`${BASE_URL}/api/admin/fraud-signals`, { headers: adminHeaders });
  totalRequests.add(1);
  fraudListDurationTrend.add(resAll.timings.duration);
  serverErrors.add(resAll.status >= 500);
  successfulAdminQueries.add(resAll.status === 200 || resAll.status === 429);
  check(resAll, {
    "fraud signals all status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. GET /api/admin/fraud-signals?scope=ips
  const resIps = http.get(`${BASE_URL}/api/admin/fraud-signals?scope=ips`, { headers: adminHeaders });
  totalRequests.add(1);
  fraudListDurationTrend.add(resIps.timings.duration);
  serverErrors.add(resIps.status >= 500);
  successfulAdminQueries.add(resIps.status === 200 || resIps.status === 429);
  check(resIps, {
    "fraud signals ips status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 3. GET /api/admin/fraud-signals?scope=devices
  const resDevices = http.get(`${BASE_URL}/api/admin/fraud-signals?scope=devices`, { headers: adminHeaders });
  totalRequests.add(1);
  fraudListDurationTrend.add(resDevices.timings.duration);
  serverErrors.add(resDevices.status >= 500);
  successfulAdminQueries.add(resDevices.status === 200 || resDevices.status === 429);
  check(resDevices, {
    "fraud signals devices status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });
}
