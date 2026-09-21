import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { transparencyRouter } from '../../server/modules/transparency/transparency.routes.js';

let server;
let baseUrl;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', transparencyRouter);

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('LoadTest: concurrent load test on public transparency endpoints', async () => {
  const endpoints = [
    '/api',
    '/api/wallets-live',
    '/api/external-investments',
    '/api/hardware-assets',
    '/api/withdrawal-stats',
  ];

  // Warm-up request to initialize Prisma connection pool
  await fetch(`${baseUrl}/api`).catch(() => null);

  // 50 concurrent requests spread across all public endpoints
  const CONCURRENCY = 50;
  const requests = Array.from({ length: CONCURRENCY }, (_, i) => {
    const ep = endpoints[i % endpoints.length];
    const start = performance.now();
    return fetch(`${baseUrl}${ep}`)
      .then(async (res) => {
        const durationMs = performance.now() - start;
        const json = await res.json().catch(() => null);
        return { status: res.status, ok: json?.ok, durationMs, ep };
      })
      .catch((err) => ({ error: err.message, ep }));
  });

  const results = await Promise.all(requests);

  const errors = results.filter((r) => r.error || (r.status !== 200 && r.status !== 429));
  assert.equal(errors.length, 0, `All concurrent requests must succeed. Errors: ${JSON.stringify(errors)}`);

  const successful = results.filter((r) => r.status === 200);
  const durations = successful.map((r) => r.durationMs).sort((a, b) => a - b);

  const p50 = durations[Math.floor(durations.length * 0.5)] || 0;
  const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
  const max = durations[durations.length - 1] || 0;

  // Verify reasonable latency (p50 under 500ms on local DB)
  assert.ok(p50 < 500, `p50 latency (${p50.toFixed(1)}ms) should be under 500ms`);

  console.log(`[LoadTest] Concurrency: ${CONCURRENCY} reqs | Success: ${successful.length} | p50: ${p50.toFixed(1)}ms | p95: ${p95.toFixed(1)}ms | Max: ${max.toFixed(1)}ms`);
});
