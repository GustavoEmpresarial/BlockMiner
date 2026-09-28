/**
 * k6 load test for Admin Offer Events (/api/admin/offer-events).
 *
 * Simulates concurrent administrative queries:
 * 1. Default events list (page=1, pageSize=20)
 * 2. Full events list (pageSize=100, matches client admin grid)
 * 3. Event detail query
 * 4. Event miners list
 * 5. Event purchases list
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5128").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulQueries = new Rate("successful_queries");
const durationTrend = new Trend("offer_events_duration_ms", true);
const totalRequests = new Counter("offer_events_requests_total");

export const options = {
  scenarios: {
    offer_events_traffic: {
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
    offer_events_duration_ms: ["p(95)<250"],
  },
};

export default function () {
  const adminHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    Cookie: `bm_admin_session=${ADMIN_TOKEN}`,
  };

  // 1. List events default (page 1, pageSize 20)
  const resDefault = http.get(`${BASE_URL}/api/admin/offer-events?page=1&pageSize=20`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resDefault.timings.duration);
  serverErrors.add(resDefault.status >= 500);
  successfulQueries.add(resDefault.status === 200 || resDefault.status === 429);
  check(resDefault, {
    "list events status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. List events full grid (pageSize 100, matches client SPA)
  const resFull = http.get(`${BASE_URL}/api/admin/offer-events?pageSize=100`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resFull.timings.duration);
  serverErrors.add(resFull.status >= 500);
  successfulQueries.add(resFull.status === 200 || resFull.status === 429);
  check(resFull, {
    "list events full status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 3. Event miners list
  const resMiners = http.get(`${BASE_URL}/api/admin/offer-events/1/miners`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resMiners.timings.duration);
  serverErrors.add(resMiners.status >= 500);
  successfulQueries.add(resMiners.status === 200 || resMiners.status === 404 || resMiners.status === 429);
  check(resMiners, {
    "event miners status ok/404 or 429": (r) => r.status === 200 || r.status === 404 || r.status === 429,
  });

  // 4. Event purchases list
  const resPurchases = http.get(`${BASE_URL}/api/admin/offer-events/1/purchases?pageSize=20`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resPurchases.timings.duration);
  serverErrors.add(resPurchases.status >= 500);
  successfulQueries.add(resPurchases.status === 200 || resPurchases.status === 404 || resPurchases.status === 429);
  check(resPurchases, {
    "event purchases status ok/404 or 429": (r) => r.status === 200 || r.status === 404 || r.status === 429,
  });

  sleep(0.05);
}
