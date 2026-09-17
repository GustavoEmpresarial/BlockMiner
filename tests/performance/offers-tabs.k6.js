/**
 * Load on the two tabs only: GET /offers and GET /admin/offer-events.
 * HTML, no login, no other routes, no purchase.
 *
 *   k6 run tests/performance/offers-tabs.k6.js
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const BASE_URL = (__ENV.BASE_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
const DEFAULT_HTTP_SLOW_REQUEST_MS = 1000;
const SLOW_MS = Number(__ENV.HTTP_SLOW_REQUEST_MS || DEFAULT_HTTP_SLOW_REQUEST_MS);
const PEAK = Number(__ENV.PEAK_ITERS_PER_SEC || 8);
const RAMP_UP = __ENV.RAMP_UP || "10s";
const HOLD = __ENV.HOLD || "20s";
const RAMP_DOWN = __ENV.RAMP_DOWN || "5s";

const serverErrors = new Rate("server_error_5xx");
const offersMs = new Trend("tab_offers_ms", true);
const offersWait = new Trend("tab_offers_waiting_ms", true);
const adminMs = new Trend("tab_admin_offers_ms", true);
const adminWait = new Trend("tab_admin_offers_waiting_ms", true);
const total = new Counter("tab_requests_total");

export const options = {
  scenarios: {
    tabs: {
      executor: "ramping-arrival-rate",
      startRate: 0,
      timeUnit: "1s",
      preAllocatedVUs: 12,
      maxVUs: 24,
      stages: [
        { duration: RAMP_UP, target: 2 },
        { duration: HOLD, target: PEAK },
        { duration: RAMP_DOWN, target: 0 },
      ],
    },
  },
  thresholds: {
    server_error_5xx: ["rate==0"],
    tab_offers_waiting_ms: [`p(95)<${SLOW_MS}`],
    tab_admin_offers_waiting_ms: [`p(95)<${SLOW_MS}`],
  },
};

function hit(path, dur, wait) {
  const res = http.get(`${BASE_URL}${path}`, { headers: { Accept: "text/html" } });
  total.add(1);
  serverErrors.add(res.status >= 500);
  dur.add(res.timings.duration);
  wait.add(res.timings.waiting);
  check(res, {
    [`GET ${path} 200`]: (r) => r.status === 200,
    [`GET ${path} HTML`]: (r) => String(r.body).includes("<!"),
  });
}

export default function () {
  hit("/offers", offersMs, offersWait);
  hit("/admin/offer-events", adminMs, adminWait);
}

export function handleSummary(data) {
  const v = (name, key) => {
    const m = data.metrics[name];
    const n = m && m.values && m.values[key];
    return typeof n === "number" ? `${n.toFixed(1)}ms` : "—";
  };
  const text = [
    `tabs load BASE_URL=${BASE_URL} slow=${SLOW_MS}ms`,
    `/offers              p50=${v("tab_offers_ms", "p(50)")} p95=${v("tab_offers_ms", "p(95)")} p99=${v("tab_offers_ms", "p(99)")} wait_p95=${v("tab_offers_waiting_ms", "p(95)")}`,
    `/admin/offer-events  p50=${v("tab_admin_offers_ms", "p(50)")} p95=${v("tab_admin_offers_ms", "p(95)")} p99=${v("tab_admin_offers_ms", "p(99)")} wait_p95=${v("tab_admin_offers_waiting_ms", "p(95)")}`,
    "",
  ].join("\n");
  return { stdout: `\n${text}\n`, "offers-tabs-k6-summary.txt": text };
}
