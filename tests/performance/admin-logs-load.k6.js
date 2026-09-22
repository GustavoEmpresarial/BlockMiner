/**
 * k6 load test for Admin System Logs Querying and Filtering.
 *
 * Simulates concurrent administrative searches, filtering by source/severity,
 * and paginated queries on /api/admin/logs.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5102").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 10);

const serverErrors = new Rate("server_error_5xx");
const successfulQueries = new Rate("successful_200");
const durationTrend = new Trend("admin_logs_query_ms", true);
const totalRequests = new Counter("admin_logs_requests_total");

export const options = {
  scenarios: {
    admin_logs_browse: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "4s", target: VUS },
        { duration: "8s", target: VUS },
        { duration: "3s", target: 0 },
      ],
    },
  },
  thresholds: {
    server_error_5xx: ["rate==0"],
    admin_logs_query_ms: ["p(95)<600"],
  },
};

const SAMPLE_SOURCES = ["all", "database", "user", "system", "client"];
const SAMPLE_SEVERITIES = ["all", "info", "warn", "error"];
const SAMPLE_QUERIES = ["faucet", "login", "claim", "deposit", "miner", ""];

export default function () {
  const source = SAMPLE_SOURCES[Math.floor(Math.random() * SAMPLE_SOURCES.length)];
  const severity = SAMPLE_SEVERITIES[Math.floor(Math.random() * SAMPLE_SEVERITIES.length)];
  const q = SAMPLE_QUERIES[Math.floor(Math.random() * SAMPLE_QUERIES.length)];
  const page = Math.floor(Math.random() * 3) + 1;

  const queryParams = [];
  if (source !== "all") queryParams.push(`source=${encodeURIComponent(source)}`);
  if (severity !== "all") queryParams.push(`severity=${encodeURIComponent(severity)}`);
  if (q) queryParams.push(`q=${encodeURIComponent(q)}`);
  queryParams.push(`page=${page}`);
  queryParams.push("pageSize=25");

  const url = `${BASE_URL}/api/admin/logs?${queryParams.join("&")}`;

  const headers = {
    "Accept": "application/json",
  };
  if (ADMIN_TOKEN) {
    headers["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    headers["Cookie"] = `admin_session=${ADMIN_TOKEN}`;
  }

  const start = Date.now();
  const res = http.get(url, { headers });
  const latency = Date.now() - start;

  totalRequests.add(1);
  durationTrend.add(latency);

  const is5xx = res.status >= 500;
  serverErrors.add(is5xx ? 1 : 0);

  const isSuccess = res.status === 200 || res.status === 401; // 401 if unauthenticated without token
  successfulQueries.add(isSuccess ? 1 : 0);

  check(res, {
    "status is not 5xx": (r) => r.status < 500,
    "valid JSON or auth rejection": (r) => r.status === 200 || r.status === 401 || r.status === 403,
  });

  sleep(0.2);
}
