import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

// Security regression (2026-09-11): GET /api/public-stats and /api/public-feed used to carry
// no rate limiter at all on this unauthenticated, DB-touching public surface — unlike every
// other public endpoint here (/live-server-stats) and unlike auth's routes. This asserts the
// fix holds: enough requests from one IP within the window get throttled with 429.
process.env.NODE_ENV = process.env.NODE_ENV || "test";

const { publicStatsRouter } = await import("../../server/modules/public-stats/index.ts");

function buildApp() {
  const app = express();
  app.use("/api", publicStatsRouter);
  return app;
}

async function withServer(fn) {
  const app = buildApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /api/public-stats is throttled after enough requests from the same IP within the window", async () => {
  await withServer(async (base) => {
    let sawTooManyRequests = false;
    for (let i = 0; i < 130 && !sawTooManyRequests; i += 1) {
      const res = await fetch(`${base}/api/public-stats`);
      if (res.status === 429) sawTooManyRequests = true;
      else assert.equal(res.status, 200, `unexpected status ${res.status} on request ${i}`);
    }
    assert.ok(sawTooManyRequests, "expected /api/public-stats to eventually respond 429 under flooding from one IP");
  });
});

test("GET /api/public-feed is throttled after enough requests from the same IP within the window", async () => {
  await withServer(async (base) => {
    let sawTooManyRequests = false;
    for (let i = 0; i < 130 && !sawTooManyRequests; i += 1) {
      const res = await fetch(`${base}/api/public-feed`);
      if (res.status === 429) sawTooManyRequests = true;
      else assert.equal(res.status, 200, `unexpected status ${res.status} on request ${i}`);
    }
    assert.ok(sawTooManyRequests, "expected /api/public-feed to eventually respond 429 under flooding from one IP");
  });
});
