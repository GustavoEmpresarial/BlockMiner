/**
 * k6 load test for Transparency System (/api/admin/transparency & /api/transparency).
 *
 * Simulates concurrent administrative and public traffic across all tabs:
 * 1. Admin entries list (/api/admin/transparency)
 * 2. Admin tracked wallets (/api/admin/transparency/tracked-wallets)
 * 3. Admin hardware assets (/api/admin/transparency/hardware-assets)
 * 4. Admin external investments (/api/admin/transparency/external-investments)
 * 5. Public transparency overview (/api/transparency)
 *
 * ONLY run against local/staging environments.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5136").replace(/\/$/, "");

// Guarda obrigatória de ambiente
if (BASE_URL.includes("blockminer.space") || BASE_URL.includes("dev.blockminer.space")) {
  throw new Error("PROIBIDO: Teste de carga nunca pode atingir blockminer.space nem dev.blockminer.space!");
}

const ADMIN_TOKEN = __ENV.ADMIN_TOKEN || "";
const VUS = Number(__ENV.VUS || 15);

const serverErrors = new Rate("server_error_5xx");
const successfulQueries = new Rate("successful_queries");
const durationTrend = new Trend("transparency_full_duration_ms", true);
const totalRequests = new Counter("transparency_full_requests_total");

export const options = {
  scenarios: {
    transparency_full_traffic: {
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
    transparency_full_duration_ms: ["p(95)<250"],
  },
};

export default function () {
  const adminHeaders = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    Cookie: `bm_admin_session=${ADMIN_TOKEN}`,
  };

  // 1. Admin list entries
  const resEntries = http.get(`${BASE_URL}/api/admin/transparency`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resEntries.timings.duration);
  serverErrors.add(resEntries.status >= 500);
  successfulQueries.add(resEntries.status === 200 || resEntries.status === 429);
  check(resEntries, {
    "admin entries status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 2. Admin list tracked wallets
  const resWallets = http.get(`${BASE_URL}/api/admin/transparency/tracked-wallets`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resWallets.timings.duration);
  serverErrors.add(resWallets.status >= 500);
  successfulQueries.add(resWallets.status === 200 || resWallets.status === 429);
  check(resWallets, {
    "admin wallets status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 3. Admin list hardware assets
  const resHardware = http.get(`${BASE_URL}/api/admin/transparency/hardware-assets`, {
    headers: adminHeaders,
  });
  totalRequests.add(1);
  durationTrend.add(resHardware.timings.duration);
  serverErrors.add(resHardware.status >= 500);
  successfulQueries.add(resHardware.status === 200 || resHardware.status === 429);
  check(resHardware, {
    "admin hardware status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 4. Public transparency summary
  const resPublic = http.get(`${BASE_URL}/api/transparency`, {
    headers: { Accept: "application/json" },
  });
  totalRequests.add(1);
  durationTrend.add(resPublic.timings.duration);
  serverErrors.add(resPublic.status >= 500);
  successfulQueries.add(resPublic.status === 200 || resPublic.status === 429);
  check(resPublic, {
    "public overview status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  // 5. Public wallets live & withdrawals
  const resWalletsLive = http.get(`${BASE_URL}/api/transparency/wallets-live`, {
    headers: { Accept: "application/json" },
  });
  totalRequests.add(1);
  durationTrend.add(resWalletsLive.timings.duration);
  serverErrors.add(resWalletsLive.status >= 500);
  successfulQueries.add(resWalletsLive.status === 200 || resWalletsLive.status === 429);
  check(resWalletsLive, {
    "public wallets-live status 200 or 429": (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.05);
}
