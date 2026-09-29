/**
 * k6 load test for Admin Miners Catalog (/api/admin/miners*).
 *
 * Simulates concurrent administrative traffic:
 * 1. Admin catalog list (/api/admin/miners)
 * 2. Admin catalog search (/api/admin/miners?q=miner)
 * 3. Admin broken machine groups (/api/admin/miners/broken-machines)
 * 4. Admin orphan machine types (/api/admin/miners/orphan-types)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5133").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulQueries = new Rate("successful_queries");
const durationTrend = new Trend("miners_duration_ms", true);
const totalRequests = new Counter("miners_requests_total");

export const options = {
  scenarios: {
    miners_traffic: {
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
    miners_duration_ms: ["p(95)<250"],
  },
};

export default function () {
  const adminHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    Cookie: `bm_admin_session=${ADMIN_TOKEN}`,
  };

  // 1. Admin list miners
  const resMiners = http.get(`${BASE_URL}/api/admin/miners`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resMiners.timings.duration);
  serverErrors.add(resMiners.status >= 500);
  successfulQueries.add(resMiners.status === 200 || resMiners.status === 429);
  check(resMiners, {
    "list miners status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. Admin search miners with filter
  const resSearch = http.get(`${BASE_URL}/api/admin/miners?q=antminer`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resSearch.timings.duration);
  serverErrors.add(resSearch.status >= 500);
  successfulQueries.add(resSearch.status === 200 || resSearch.status === 429);
  check(resSearch, {
    "search miners status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 3. Admin broken machines
  const resBroken = http.get(`${BASE_URL}/api/admin/miners/broken-machines`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resBroken.timings.duration);
  serverErrors.add(resBroken.status >= 500);
  successfulQueries.add(resBroken.status === 200 || resBroken.status === 429);
  check(resBroken, {
    "broken machines status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 4. Admin orphan types
  const resOrphans = http.get(`${BASE_URL}/api/admin/miners/orphan-types`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resOrphans.timings.duration);
  serverErrors.add(resOrphans.status >= 500);
  successfulQueries.add(resOrphans.status === 200 || resOrphans.status === 429);
  check(resOrphans, {
    "orphan types status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.05);
}
