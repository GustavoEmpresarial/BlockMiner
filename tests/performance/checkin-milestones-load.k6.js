/**
 * k6 load test for Admin Check-in Milestones (/api/admin/checkin-milestones).
 *
 * Simulates concurrent administrative queries:
 * 1. List check-in milestones (/api/admin/checkin-milestones)
 * 2. Scan streak anomalies (/api/admin/checkin-streak-anomalies)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5130").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulQueries = new Rate("successful_queries");
const durationTrend = new Trend("checkin_milestones_duration_ms", true);
const totalRequests = new Counter("checkin_milestones_requests_total");

export const options = {
  scenarios: {
    checkin_milestones_traffic: {
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
    checkin_milestones_duration_ms: ["p(95)<250"],
  },
};

export default function () {
  const adminHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    Cookie: `bm_admin_session=${ADMIN_TOKEN}`,
  };

  // 1. List milestones
  const resMilestones = http.get(`${BASE_URL}/api/admin/checkin-milestones`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resMilestones.timings.duration);
  serverErrors.add(resMilestones.status >= 500);
  successfulQueries.add(resMilestones.status === 200 || resMilestones.status === 429);
  check(resMilestones, {
    "list milestones status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. Scan streak anomalies
  const resAnomalies = http.get(`${BASE_URL}/api/admin/checkin-streak-anomalies`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resAnomalies.timings.duration);
  serverErrors.add(resAnomalies.status >= 500);
  successfulQueries.add(resAnomalies.status === 200 || resAnomalies.status === 429);
  check(resAnomalies, {
    "scan anomalies status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.05);
}
