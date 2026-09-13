/**
 * k6 load test for the /media static surface (server/bootstrap/server.ts).
 *
 * Context: dev.blockminer.space/inventory got noticeably heavier right after
 * syncing real prod uploads to staging (storage/scripts/deploy/sync_staging_uploads.py) —
 * dozens of miner/rack/fan images that previously 404'd to a lightweight
 * placeholder started actually loading. The fix (30d immutable Cache-Control on
 * express.static) is unit-tested in tests/media/media.static-cache.test.mjs; THIS
 * file is the load test called for by the mandatory quality gate's performance
 * catalog — it validates the fix holds under real concurrent traffic, not just a
 * single request.
 *
 * /inventory and /rooms API endpoints all require a session (requireAuth) and
 * several are write/critical-mutation routes (install, buy, uninstall) — load
 * testing those against a real shared staging DB without a dedicated test
 * account would risk corrupting real state, so they are out of scope here.
 * /media is public, read-only, and static: safe to hammer directly.
 *
 * Install (no root needed):
 *   curl -sSL https://github.com/grafana/k6/releases/download/v2.2.0/k6-v2.2.0-linux-amd64.tar.gz \
 *     | tar -xz -C /tmp && cp /tmp/k6-v2.2.0-linux-amd64/k6 ~/.local/bin/k6
 *
 * Usage:
 *   k6 run tests/performance/media.k6.js
 *   k6 run -e BASE_URL=https://dev.blockminer.space tests/performance/media.k6.js
 *   k6 run -e BASE_URL=https://dev.blockminer.space -e VUS=30 -e DURATION=20s tests/performance/media.k6.js
 */
import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3001";
const VUS = Number(__ENV.VUS || 20);
const DURATION = __ENV.DURATION || "15s";

// Real filenames confirmed present on both prod and staging after the
// sync_staging_uploads.py run (2026-09-12) — a mix of seed files and real
// synced uploads, so the test exercises both code paths.
const MEDIA_PATHS = [
  "/media/miners/1.webp",
  "/media/miners/2.webp",
  "/media/miners/3.webp",
  "/media/miners/reward1.webp",
  "/media/miners/1780321812460-a416288557be.webp",
  "/media/miners/miner-1779308014546-fa8dfa74a766ec02.webp",
];

const missingCacheControl = new Rate("missing_cache_control");
const notFound = new Rate("not_found");
const responseTime = new Trend("media_response_time", true);

export const options = {
  scenarios: {
    media_load: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  // Objective pass/fail thresholds — per the mandatory quality gate, a load
  // test needs explicit numeric criteria, not a subjective "seems fine".
  thresholds: {
    http_req_failed: ["rate<0.01"], // < 1% errors
    http_req_duration: ["p(95)<500", "p(99)<1200"],
    missing_cache_control: ["rate==0"], // every hit must carry Cache-Control post-fix
    not_found: ["rate==0"], // every listed path must actually exist
  },
};

export default function () {
  const path = MEDIA_PATHS[Math.floor(Math.random() * MEDIA_PATHS.length)];
  const res = http.get(`${BASE_URL}${path}`);

  responseTime.add(res.timings.duration);
  notFound.add(res.status === 404);
  missingCacheControl.add(!res.headers["Cache-Control"]);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "has Cache-Control": (r) => Boolean(r.headers["Cache-Control"]),
    "Cache-Control is immutable, 30d": (r) =>
      (r.headers["Cache-Control"] || "").includes("immutable") && (r.headers["Cache-Control"] || "").includes("max-age=2592000"),
  });
}
