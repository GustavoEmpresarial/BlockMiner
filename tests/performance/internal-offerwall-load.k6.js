/**
 * k6 load test for Internal Offerwall (/api/internal-offerwall & /api/admin/internal-offerwall).
 *
 * Simulates concurrent player and admin traffic:
 * 1. Feature status check (/api/internal-offerwall/status)
 * 2. Admin offers list (/api/admin/internal-offerwall/offers)
 * 3. Admin review queue (/api/admin/internal-offerwall/attempts)
 * 4. Admin frame hosts (/api/admin/internal-offerwall/frame-hosts)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5126").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulQueries = new Rate("successful_queries");
const durationTrend = new Trend("internal_offerwall_duration_ms", true);
const totalRequests = new Counter("internal_offerwall_requests_total");

export const options = {
  scenarios: {
    internal_offerwall_traffic: {
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
    internal_offerwall_duration_ms: ["p(95)<250"],
  },
};

export default function () {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const adminHeaders = {
    ...headers,
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    Cookie: `bm_admin_session=${ADMIN_TOKEN}`,
  };

  // 1. Status check
  const resStatus = http.get(`${BASE_URL}/api/internal-offerwall/status`, { headers });
  totalRequests.add(1);
  durationTrend.add(resStatus.timings.duration);
  serverErrors.add(resStatus.status >= 500);
  successfulQueries.add(resStatus.status === 200);
  check(resStatus, {
    "status endpoint ok": (r) => r.status === 200,
  });

  // 2. Admin list offers
  const resOffers = http.get(`${BASE_URL}/api/admin/internal-offerwall/offers`, { headers: adminHeaders });
  totalRequests.add(1);
  durationTrend.add(resOffers.timings.duration);
  serverErrors.add(resOffers.status >= 500);
  successfulQueries.add(resOffers.status === 200 || resOffers.status === 429);
  check(resOffers, {
    "admin offers ok or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 3. Admin list attempts (review queue)
  const resAttempts = http.get(`${BASE_URL}/api/admin/internal-offerwall/attempts?status=PENDING_REVIEW`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resAttempts.timings.duration);
  serverErrors.add(resAttempts.status >= 500);
  successfulQueries.add(resAttempts.status === 200 || resAttempts.status === 429);
  check(resAttempts, {
    "admin attempts ok or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 4. Admin list frame hosts
  const resHosts = http.get(`${BASE_URL}/api/admin/internal-offerwall/frame-hosts`, { headers: adminHeaders });
  totalRequests.add(1);
  durationTrend.add(resHosts.timings.duration);
  serverErrors.add(resHosts.status >= 500);
  successfulQueries.add(resHosts.status === 200 || resHosts.status === 429);
  check(resHosts, {
    "admin frame hosts ok or 429": (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.05);
}
