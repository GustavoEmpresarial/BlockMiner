/**
 * k6 load test for AntiBot endpoints:
 * 1. GET /api/admin/antibot/overview (Admin overview metrics)
 * 2. GET /api/admin/antibot/alerts (Admin alerts list)
 * 3. POST /api/antibot/telemetry (Public/Player client telemetry beacon)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5126").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulAdminQueries = new Rate("successful_admin_queries");
const successfulTelemetryPosts = new Rate("successful_telemetry_posts");
const adminOverviewDurationTrend = new Trend("admin_antibot_overview_duration_ms", true);
const telemetryDurationTrend = new Trend("public_antibot_telemetry_duration_ms", true);
const totalRequests = new Counter("antibot_requests_total");

export const options = {
  scenarios: {
    antibot_traffic: {
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
    admin_antibot_overview_duration_ms: ["p(95)<300"],
    public_antibot_telemetry_duration_ms: ["p(95)<300"],
  },
};

export default function () {
  // 1. Admin AntiBot Overview (GET /api/admin/antibot/overview)
  const adminHeaders = {
    Accept: "application/json",
  };
  if (ADMIN_TOKEN) {
    adminHeaders["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    adminHeaders["Cookie"] = `bm_admin_session=${ADMIN_TOKEN}`;
  }
  const overviewRes = http.get(`${BASE_URL}/api/admin/antibot/overview`, { headers: adminHeaders });
  totalRequests.add(1);
  adminOverviewDurationTrend.add(overviewRes.timings.duration);
  serverErrors.add(overviewRes.status >= 500);
  successfulAdminQueries.add(overviewRes.status === 200 || overviewRes.status === 429);
  check(overviewRes, {
    "admin overview status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. Admin AntiBot Alerts (GET /api/admin/antibot/alerts)
  const alertsRes = http.get(`${BASE_URL}/api/admin/antibot/alerts`, { headers: adminHeaders });
  totalRequests.add(1);
  adminOverviewDurationTrend.add(alertsRes.timings.duration);
  serverErrors.add(alertsRes.status >= 500);
  successfulAdminQueries.add(alertsRes.status === 200 || alertsRes.status === 429);
  check(alertsRes, {
    "admin alerts status is 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 3. Client Telemetry Beacon (POST /api/antibot/telemetry)
  const telemetryPayload = JSON.stringify({
    eventType: "game:load",
    sessionId: "k6-sess-" + Math.random().toString(36).slice(2),
    telemetry: {
      behavior: {
        clickCount: 5,
        intervals: [120, 150, 180, 130],
        humanLikeInput: true,
      },
      device: {
        platform: "Linux x86_64",
        screen: "1920x1080",
      },
    },
  });

  const telRes = http.post(`${BASE_URL}/api/antibot/telemetry`, telemetryPayload, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
  totalRequests.add(1);
  telemetryDurationTrend.add(telRes.timings.duration);
  serverErrors.add(telRes.status >= 500);
  successfulTelemetryPosts.add(telRes.status === 200);
  check(telRes, {
    "telemetry beacon status is 200": (r) => r.status === 200,
  });
}
