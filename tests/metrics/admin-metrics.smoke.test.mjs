import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import "../_env-test-overrides.mjs";
import { adminRouter } from "../../server/modules/admin/admin.routes.ts";
import { buildOpsSnapshot } from "../../server/modules/admin/admin.ops.snapshot.ts";
import { collectServerMetrics, getServerMetrics } from "../../server/modules/admin/admin.server-metrics.controller.ts";

const PORT = 5135;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "default_test_secret_for_local_ci";

const monitoringToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["monitoring", "dashboard"] },
  JWT_SECRET,
  { issuer: "blockminer-admin", algorithm: "HS256" }
);

const forbiddenToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["support"] },
  JWT_SECRET,
  { issuer: "blockminer-admin", algorithm: "HS256" }
);

let server;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/admin", adminRouter);

  await new Promise((resolve) => {
    server = app.listen(PORT, "127.0.0.1", resolve);
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ─── Direct Logic Smoke Tests ──────────────────────────────────────────────────

test("Smoke: buildOpsSnapshot completes full operational health pipeline", async () => {
  const snapshot = await buildOpsSnapshot();

  assert.equal(typeof snapshot.timestamp, "string");
  assert.ok(!isNaN(Date.parse(snapshot.timestamp)));

  // Readiness
  assert.equal(typeof snapshot.readiness.ok, "boolean");
  assert.ok(snapshot.readiness.checks.postgres != null);
  assert.equal(typeof snapshot.readiness.checks.postgres.ok, "boolean");
  assert.equal(typeof snapshot.readiness.checks.postgres.latencyMs, "number");
  assert.ok(snapshot.readiness.checks.postgres.latencyMs >= 0);

  // Event loop lag
  assert.equal(snapshot.eventLoopLag.sampleWindowMs, 200);
  assert.equal(typeof snapshot.eventLoopLag.maxMs, "number");
  assert.equal(typeof snapshot.eventLoopLag.meanMs, "number");
  assert.equal(typeof snapshot.eventLoopLag.p99Ms, "number");
  assert.ok(snapshot.eventLoopLag.maxMs >= 0);
  assert.ok(snapshot.eventLoopLag.meanMs >= 0);
  assert.ok(snapshot.eventLoopLag.p99Ms >= 0);

  // Runtime
  assert.ok(snapshot.runtime.pid > 0);
  assert.ok(snapshot.runtime.uptimeSeconds >= 0);
  assert.ok(snapshot.runtime.memoryRssBytes > 0);
  assert.ok(snapshot.runtime.memoryHeapUsedBytes > 0);
  assert.equal(snapshot.runtime.platform, process.platform);
  assert.equal(snapshot.runtime.nodeVersion, process.version);

  // Telemetry contracts
  assert.equal(typeof snapshot.http.requestsTotal, "number");
  assert.equal(typeof snapshot.http.requestsPerMinuteEstimate, "number");
  assert.equal(typeof snapshot.http.errors5xxTotal, "number");

  assert.equal(typeof snapshot.socket.connectionsActive, "number");
  assert.equal(typeof snapshot.mining.blockNumber, "number");
  assert.equal(typeof snapshot.queues.bullmqWaiting, "number");
  assert.equal(typeof snapshot.redis.connected, "number");

  // Economy rows (array of module, action, total)
  assert.ok(Array.isArray(snapshot.economy));
  assert.ok(snapshot.economy.length >= 3);
  for (const row of snapshot.economy) {
    assert.equal(typeof row.module, "string");
    assert.equal(typeof row.action, "string");
    assert.equal(typeof row.total, "number");
  }

  // Alerts array
  assert.ok(Array.isArray(snapshot.alerts));
});

test("Smoke: collectServerMetrics and getServerMetrics return non-empty system metrics", async () => {
  const metrics = await collectServerMetrics();

  assert.ok(metrics.serverCpuCores > 0);
  assert.ok(metrics.serverMemoryTotalBytes > 0);
  assert.ok(metrics.serverMemoryUsedBytes > 0);
  assert.ok(metrics.serverMemoryUsagePercent >= 0 && metrics.serverMemoryUsagePercent <= 100);

  let statusCode = 200;
  let sentData = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      sentData = data;
      return this;
    },
  };

  await getServerMetrics({}, res);

  assert.equal(statusCode, 200);
  assert.equal(sentData.ok, true);
  assert.ok(sentData.metrics.cpuCores > 0);
  assert.ok(sentData.metrics.memoryTotalBytes > 0);
  assert.equal(typeof sentData.metrics.uptimeSeconds, "number");
  assert.equal(typeof sentData.metrics.platform, "string");
});

// ─── HTTP Smoke Tests ─────────────────────────────────────────────────────────

test("HTTP Smoke: GET /api/admin/ops/server-metrics sem token retorna 401", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/ops/server-metrics`);
  assert.equal(res.status, 401);
});

test("HTTP Smoke: GET /api/admin/ops/server-metrics com token sem permissão monitoring retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/ops/server-metrics`, {
    headers: { Authorization: `Bearer ${forbiddenToken}` },
  });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "FORBIDDEN_PERMISSION");
});

test("HTTP Smoke: GET /api/admin/ops/server-metrics com token válido retorna 200 e métricas", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/ops/server-metrics`, {
    headers: { Authorization: `Bearer ${monitoringToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(typeof data.metrics.cpuUsagePercent, "number");
  assert.ok(data.metrics.cpuCores > 0);
  assert.ok(data.metrics.memoryTotalBytes > 0);
});

test("HTTP Smoke: GET /api/admin/server-metrics (alias direto) retorna 200", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/server-metrics`, {
    headers: { Authorization: `Bearer ${monitoringToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.metrics.uptimeSeconds >= 0);
});

test("HTTP Smoke: GET /api/admin/ops/snapshot sem token retorna 401", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/ops/snapshot`);
  assert.equal(res.status, 401);
});

test("HTTP Smoke: GET /api/admin/ops/snapshot com token sem permissão retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/ops/snapshot`, {
    headers: { Authorization: `Bearer ${forbiddenToken}` },
  });
  assert.equal(res.status, 403);
});

test("HTTP Smoke: GET /api/admin/ops/snapshot com token válido retorna 200 e snapshot", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/ops/snapshot`, {
    headers: { Authorization: `Bearer ${monitoringToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.snapshot != null);
  assert.equal(typeof data.snapshot.readiness.ok, "boolean");
  assert.ok(Array.isArray(data.snapshot.economy));
  assert.ok(data.snapshot.runtime.pid > 0);
});
