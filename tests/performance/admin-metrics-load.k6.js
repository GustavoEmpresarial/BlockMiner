/**
 * k6 load test for Admin Metrics & Ops endpoints:
 * 1. GET /api/admin/ops/server-metrics (Host telemetries: CPU, RAM, Disk, Uptime)
 * 2. GET /api/admin/server-metrics (Direct compatibility alias)
 * 3. GET /api/admin/ops/snapshot (Operational readiness and runtime telemetry)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5136").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulAdminQueries = new Rate("successful_admin_queries");
const serverMetricsDurationTrend = new Trend("admin_server_metrics_duration_ms", true);
const opsSnapshotDurationTrend = new Trend("admin_ops_snapshot_duration_ms", true);
const totalRequests = new Counter("metrics_requests_total");

export const options = {
  scenarios: {
    metrics_traffic: {
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
    admin_server_metrics_duration_ms: ["p(95)<300"],
    admin_ops_snapshot_duration_ms: ["p(95)<500"],
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

  // 1. GET /api/admin/ops/server-metrics
  const resMetrics = http.get(`${BASE_URL}/api/admin/ops/server-metrics`, { headers: adminHeaders });
  totalRequests.add(1);
  serverMetricsDurationTrend.add(resMetrics.timings.duration);
  serverErrors.add(resMetrics.status >= 500);
  successfulAdminQueries.add(resMetrics.status === 200 || resMetrics.status === 429);
  check(resMetrics, {
    "server metrics status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. GET /api/admin/server-metrics (alias)
  const resAlias = http.get(`${BASE_URL}/api/admin/server-metrics`, { headers: adminHeaders });
  totalRequests.add(1);
  serverMetricsDurationTrend.add(resAlias.timings.duration);
  serverErrors.add(resAlias.status >= 500);
  successfulAdminQueries.add(resAlias.status === 200 || resAlias.status === 429);
  check(resAlias, {
    "server metrics alias status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 3. GET /api/admin/ops/snapshot
  const resSnapshot = http.get(`${BASE_URL}/api/admin/ops/snapshot`, { headers: adminHeaders });
  totalRequests.add(1);
  opsSnapshotDurationTrend.add(resSnapshot.timings.duration);
  serverErrors.add(resSnapshot.status >= 500);
  successfulAdminQueries.add(resSnapshot.status === 200 || resSnapshot.status === 429);
  check(resSnapshot, {
    "ops snapshot status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });
}
