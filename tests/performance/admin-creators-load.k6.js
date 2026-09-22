/**
 * k6 load test for Admin Creators and Social Endpoints.
 *
 * Simulates concurrent administrative queries across creators flags,
 * social profiles, credential requests, submissions and reward settings.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "https://blockminer.space").replace(/\/$/, "");
const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 10);

const serverErrors = new Rate("server_error_5xx");
const successfulQueries = new Rate("successful_queries");
const durationTrend = new Trend("admin_creators_query_ms", true);
const totalRequests = new Counter("admin_creators_requests_total");

export const options = {
  scenarios: {
    admin_creators_browse: {
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
    admin_creators_query_ms: ["p(95)<1500"],
  },
};

const SAMPLE_SEARCHES = ["miner", "admin", "block", "test", "user", "crypto"];
const SAMPLE_STATUSES = ["pending", "approved", "rejected", "all"];

export default function () {
  const headers = {
    Accept: "application/json",
  };
  if (ADMIN_TOKEN) {
    headers["Authorization"] = `Bearer ${ADMIN_TOKEN}`;
    headers["Cookie"] = `blockminer_admin_token=${ADMIN_TOKEN}`;
  }

  // 1. Browse Creators Flags
  const creatorsRes = http.get(`${BASE_URL}/api/admin/creators`, { headers });
  totalRequests.add(1);
  durationTrend.add(creatorsRes.timings.duration);
  serverErrors.add(creatorsRes.status >= 500);
  successfulQueries.add(creatorsRes.status === 200 || creatorsRes.status === 401);

  // 2. Search Creators
  const searchQ = SAMPLE_SEARCHES[Math.floor(Math.random() * SAMPLE_SEARCHES.length)];
  const searchRes = http.get(`${BASE_URL}/api/admin/creators/search?q=${encodeURIComponent(searchQ)}`, { headers });
  totalRequests.add(1);
  durationTrend.add(searchRes.timings.duration);
  serverErrors.add(searchRes.status >= 500);

  // 3. Submissions Filtering
  const status = SAMPLE_STATUSES[Math.floor(Math.random() * SAMPLE_STATUSES.length)];
  const subsRes = http.get(`${BASE_URL}/api/admin/social/submissions?status=${encodeURIComponent(status)}`, { headers });
  totalRequests.add(1);
  durationTrend.add(subsRes.timings.duration);
  serverErrors.add(subsRes.status >= 500);

  // 4. Profiles & Reward Settings
  const settingsRes = http.get(`${BASE_URL}/api/admin/social/reward-settings`, { headers });
  totalRequests.add(1);
  durationTrend.add(settingsRes.timings.duration);
  serverErrors.add(settingsRes.status >= 500);

  sleep(0.3);
}
