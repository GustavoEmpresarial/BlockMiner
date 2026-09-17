/**
 * k6 load test for Minhas Máquinas / Sala de Mineração GETs.
 *
 * setup() logs in once and shares Cookie header with all VUs.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "https://dev.blockminer.space").replace(/\/$/, "");
const VUS = Number(__ENV.VUS || 3);
const DURATION = __ENV.DURATION || "30s";
const EMAIL = __ENV.LOADTEST_EMAIL || "";
const PASSWORD = __ENV.LOADTEST_PASSWORD || "";

const serverErrors = new Rate("server_error_5xx");
const authFailed = new Rate("auth_failed");
const roomsMs = new Trend("machines_rooms_ms", true);
const inventoryMs = new Trend("machines_inventory_ms", true);
const vaultMs = new Trend("machines_vault_ms", true);
const slotsMs = new Trend("machines_slots_ms", true);
const total = new Counter("machines_requests_total");

export const options = {
  scenarios: {
    machines_load: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    server_error_5xx: ["rate==0"],
    auth_failed: ["rate<0.05"],
    machines_rooms_ms: ["p(95)<8000"],
    machines_inventory_ms: ["p(95)<8000"],
    machines_vault_ms: ["p(95)<8000"],
    machines_slots_ms: ["p(95)<5000"],
  },
};

function cookieHeaderFromResponse(res) {
  const parts = [];
  const jar = res.cookies || {};
  for (const name of Object.keys(jar)) {
    const arr = jar[name];
    if (arr && arr[0] && arr[0].value) parts.push(`${name}=${arr[0].value}`);
  }
  return parts.join("; ");
}

export function setup() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("LOADTEST_EMAIL and LOADTEST_PASSWORD are required");
  }
  const session = http.get(`${BASE_URL}/api/auth/session`);
  const csrf =
    (session.cookies && session.cookies.blockminer_csrf && session.cookies.blockminer_csrf[0] &&
      session.cookies.blockminer_csrf[0].value) ||
    "";
  const login = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ identifier: EMAIL, password: PASSWORD }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
    },
  );
  if (login.status !== 200) {
    throw new Error(`login failed status=${login.status} body=${String(login.body).slice(0, 200)}`);
  }
  const cookie = [cookieHeaderFromResponse(session), cookieHeaderFromResponse(login)]
    .filter(Boolean)
    .join("; ");
  return { cookie, csrf };
}

export default function (data) {
  const headers = {
    Cookie: data.cookie || "",
    "X-CSRF-Token": data.csrf || "",
  };
  const paths = [
    { path: "/api/rooms", trend: roomsMs },
    { path: "/api/inventory", trend: inventoryMs },
    { path: "/api/vault", trend: vaultMs },
    { path: "/api/rooms/slots", trend: slotsMs },
  ];

  for (const p of paths) {
    const res = http.get(`${BASE_URL}${p.path}`, { headers });
    total.add(1);
    p.trend.add(res.timings.duration);
    serverErrors.add(res.status >= 500);
    authFailed.add(res.status === 401 || res.status === 403);
    check(res, {
      [`${p.path} not 5xx`]: (r) => r.status < 500,
      [`${p.path} is 200`]: (r) => r.status === 200,
    });
  }
  sleep(0.5);
}
