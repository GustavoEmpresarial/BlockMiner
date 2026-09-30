import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import "../_env-test-overrides.mjs";
import { antibotRouter, antibotAdminRouter } from "../../server/modules/antibot/antibot.routes.ts";

const PORT = 5125;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "default_test_secret_for_local_ci";

const adminToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["antibot", "antibot.view"] },
  JWT_SECRET,
  { issuer: "blockminer-admin", algorithm: "HS256" }
);

const financeToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["finance"] },
  JWT_SECRET,
  { issuer: "blockminer-admin", algorithm: "HS256" }
);

let server;

test.before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/antibot", antibotRouter);
  app.use("/api/admin/antibot", antibotAdminRouter);

  await new Promise((resolve) => {
    server = app.listen(PORT, "127.0.0.1", resolve);
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ─── Smoke Tests HTTP ─────────────────────────────────────────────────────────

test("HTTP smoke: POST /api/antibot/telemetry público retorna 200 ok", async () => {
  const res = await fetch(`${BASE_URL}/api/antibot/telemetry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType: "test:smoke", telemetry: {} }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
});

test("HTTP smoke: GET /api/admin/antibot/overview sem token retorna 401", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/overview`);
  assert.equal(res.status, 401);
});

test("HTTP smoke: GET /api/admin/antibot/overview com token financeiro (sem antibot.view) retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/overview`, {
    headers: { Authorization: `Bearer ${financeToken}` },
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: GET /api/admin/antibot/overview com token admin retorna 200 ok", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/overview`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.topRisk), true);
});

test("HTTP smoke: GET /api/admin/antibot/evidence com token admin retorna 200 ok", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/evidence`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.items), true);
});

test("HTTP smoke: GET /api/admin/antibot/sessions com token admin retorna 200 ok", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/sessions`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.items), true);
});

test("HTTP smoke: GET /api/admin/antibot/devices com token admin retorna 200 ok", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/devices`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.items), true);
});

test("HTTP smoke: GET /api/admin/antibot/alerts com token admin retorna 200 ok", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/alerts`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.items), true);
});

test("HTTP smoke: GET /api/admin/antibot/users/abc com id inválido retorna 400 invalid_id", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/users/abc`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "invalid_id");
});

test("HTTP smoke: GET /api/admin/antibot/users/-1 com id negativo retorna 400 invalid_id", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/users/-1`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "invalid_id");
});

test("HTTP smoke: PATCH /api/admin/antibot/alerts/1 com token financeiro retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/alerts/1`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${financeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "resolved" }),
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: PATCH /api/admin/antibot/alerts/1 com status inválido retorna 400", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/alerts/1`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "invalid_status_enum" }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "validation_error");
});

test("HTTP smoke: POST /api/admin/antibot/users/1/trust com token financeiro retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/users/1/trust`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${financeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ trusted: true }),
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: POST /api/admin/antibot/users/1/recompute com token financeiro retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/users/1/recompute`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${financeToken}`,
    },
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: POST /api/admin/antibot/reset com token financeiro retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/antibot/reset`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${financeToken}`,
    },
  });
  assert.equal(res.status, 403);
});
