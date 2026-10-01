import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import "../_env-test-overrides.mjs";
import { trafficAdminRouter } from "../../server/modules/traffic/traffic.admin.routes.ts";

const PORT = 5140;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "default_test_secret_for_local_ci";

const trafficAdminToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["traffic"] },
  JWT_SECRET,
  { issuer: "blockminer-admin", algorithm: "HS256" }
);

const moderatorToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["traffic.view"] },
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
  app.use("/api/admin", trafficAdminRouter);

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

test("HTTP Smoke: GET /api/admin/traffic/summary sem token retorna 401", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/traffic/summary`);
  assert.equal(res.status, 401);
});

test("HTTP Smoke: GET /api/admin/traffic/summary com token sem permissão retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/traffic/summary`, {
    headers: { Authorization: `Bearer ${forbiddenToken}` },
  });
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "FORBIDDEN_PERMISSION");
});

test("HTTP Smoke: GET /api/admin/traffic/summary com token traffic.view retorna 200 e resumo", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/traffic/summary?days=14`, {
    headers: { Authorization: `Bearer ${moderatorToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(typeof data.totalHits, "number");
  assert.equal(typeof data.periodHits, "number");
  assert.equal(typeof data.totalRegs, "number");
  assert.equal(typeof data.periodRegs, "number");
  assert.equal(data.days, 14);
});

test("HTTP Smoke: GET /api/admin/traffic/by-domain retorna 200 e lista de domínios", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/traffic/by-domain?days=30`, {
    headers: { Authorization: `Bearer ${trafficAdminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.rows), true);
  if (data.rows.length > 0) {
    const row = data.rows[0];
    assert.equal(typeof row.domain, "string");
    assert.equal(typeof row.hits, "number");
    assert.equal(typeof row.registrations, "number");
  }
});

test("HTTP Smoke: GET /api/admin/traffic/by-utm retorna 200 e lista de fontes UTM", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/traffic/by-utm?days=30`, {
    headers: { Authorization: `Bearer ${trafficAdminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.rows), true);
  if (data.rows.length > 0) {
    const row = data.rows[0];
    assert.equal(typeof row.source, "string");
    assert.equal(typeof row.hits, "number");
    assert.equal(typeof row.registrations, "number");
  }
});

test("HTTP Smoke: GET /api/admin/traffic/daily retorna 200 e série temporal diária ordenada", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/traffic/daily?days=7`, {
    headers: { Authorization: `Bearer ${trafficAdminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.rows), true);
  assert.ok(data.rows.length >= 7);
  for (const row of data.rows) {
    assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof row.hits, "number");
    assert.equal(typeof row.registrations, "number");
  }
});

test("HTTP Smoke: GET /api/admin/traffic/summary com dias negativos retorna 400 VALIDATION_ERROR", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/traffic/summary?days=-5`, {
    headers: { Authorization: `Bearer ${trafficAdminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "VALIDATION_ERROR");
});

test("HTTP Smoke: GET /api/admin/traffic/summary com dias > 365 retorna 400 VALIDATION_ERROR", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/traffic/summary?days=400`, {
    headers: { Authorization: `Bearer ${trafficAdminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "VALIDATION_ERROR");
});

test("HTTP Smoke: GET /api/admin/traffic/summary com parâmetro rogue retorna 400 VALIDATION_ERROR", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/traffic/summary?days=30&sqli=true`, {
    headers: { Authorization: `Bearer ${trafficAdminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "VALIDATION_ERROR");
});
