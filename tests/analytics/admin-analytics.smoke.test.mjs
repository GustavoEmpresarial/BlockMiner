import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import "../_env-test-overrides.mjs";
import { analyticsAdminRouter } from "../../server/modules/analytics/analytics.admin.routes.ts";

const PORT = 5146;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "default_test_secret_for_local_ci";

const adminToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["dashboard"] },
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
  app.use(cookieParser());
  app.use("/api/admin", analyticsAdminRouter);

  await new Promise((resolve) => {
    server = app.listen(PORT, "127.0.0.1", resolve);
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ─── HTTP Smoke Tests ─────────────────────────────────────────────────────────

test("Smoke: GET /api/admin/stats sem token retorna 401", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/stats`);
  assert.equal(res.status, 401);
});

test("Smoke: GET /api/admin/stats com token sem permissão retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${forbiddenToken}` },
  });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "FORBIDDEN_PERMISSION");
});

test("Smoke: GET /api/admin/stats com token autorizado retorna 200 e objeto stats", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.stats);
  assert.equal(typeof data.stats.usersTotal, "number");
  assert.equal(typeof data.stats.minersActive, "number");
  assert.equal(typeof data.stats.balanceTotal, "number");
  assert.equal(typeof data.stats.miningBlockRewardPol, "number");
});

test("Smoke: GET /api/admin/analytics com token retorna 200 e resumo completo", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/analytics?period=month`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.summary);
  assert.equal(typeof data.summary.periodDistributed, "number");
  assert.ok(data.forecast);
  assert.ok(Array.isArray(data.chartData));
  assert.ok(Array.isArray(data.topEarners));
});

test("Smoke: GET /api/admin/analytics/executive retorna 200 e KPIs executivos", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/analytics/executive?period=week`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.executive);
  assert.equal(typeof data.executive.usersTotal, "number");
  assert.equal(typeof data.executive.retentionPercent, "number");
  assert.equal(typeof data.executive.miningEfficiencyPercent, "number");
});

test("Smoke: GET /api/admin/analytics/inflation retorna 200 e série de inflação", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/analytics/inflation?period=week`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.series));
  assert.ok(data.totals);
  assert.equal(typeof data.totals.circulatingNet, "number");
});

test("Smoke: GET /api/admin/analytics/projections retorna 200 e previsões empíricas/teóricas", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/analytics/projections?period=month`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.theoretical);
  assert.equal(typeof data.theoretical.day1, "number");
  assert.ok(data.empirical);
  assert.ok(data.assumptions);
});

test("Smoke: GET /api/admin/analytics/withdrawals retorna 200 e estatísticas de saque", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/analytics/withdrawals?period=month`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.stats);
  assert.equal(typeof data.stats.avg, "number");
  assert.ok(data.statusBreakdownPeriod);
  assert.ok(Array.isArray(data.series));
});

test("Smoke: GET /api/admin/analytics/distribution retorna 200 e detalhamento por fonte", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/analytics/distribution?period=month`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.sources));
  assert.ok(data.depositsInflow);
  assert.ok(Array.isArray(data.outflows));
  assert.ok(data.miningExpected);
});

// ─── Negative & Validation Tests ─────────────────────────────────────────────

test("Smoke Negativo: GET /api/admin/analytics com período inválido retorna 400 INVALID_QUERY", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/analytics?period=invalid_period`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "INVALID_QUERY");
});

test("Smoke Negativo: GET /api/admin/analytics com userId negativo retorna 400 INVALID_QUERY", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/analytics?userId=-1`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "INVALID_QUERY");
});

test("Smoke Negativo: GET /api/admin/analytics com userId não-numérico retorna 400 INVALID_QUERY", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/analytics?userId=sqli_attempt`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "INVALID_QUERY");
});

test("Smoke Negativo: GET /api/admin/analytics com parâmetro não permitido retorna 400 INVALID_QUERY", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/analytics?inject=true`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "INVALID_QUERY");
});

test("Smoke Negativo: GET /api/admin/analytics/executive com parâmetro extra retorna 400", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/analytics/executive?extraParam=1`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "INVALID_QUERY");
});
