import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import "../_env-test-overrides.mjs";
import { supportAdminRouter } from "../../server/modules/support/support.admin.routes.ts";

const PORT = 5123;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "default_test_secret_for_local_ci";

const adminToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["support", "support.view"] },
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
  app.use("/api/admin", supportAdminRouter);

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

test("HTTP smoke: GET /api/admin/support sem token retorna 401", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/support`);
  assert.equal(res.status, 401);
});

test("HTTP smoke: GET /api/admin/support com token de finance (sem support.view) retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/support`, {
    headers: { Authorization: `Bearer ${financeToken}` },
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: GET /api/admin/support com token de support retorna 200 ok", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/support`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.messages), true);
});

test("HTTP smoke: GET /api/admin/support/abc com id inválido retorna 400 invalid_id", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/support/abc`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "invalid_id");
});

test("HTTP smoke: GET /api/admin/support/-1 com id negativo retorna 400 invalid_id", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/support/-1`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
});

test("HTTP smoke: POST /api/admin/support/1/reply com token de finance retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/support/1/reply`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${financeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reply: "Tentativa não autorizada" }),
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: POST /api/admin/support/1/credit-pol com token de finance retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/support/1/credit-pol`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${financeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: 10, reason: "Tentativa de injeção financeira" }),
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: POST /api/admin/support/1/credit-pol com corpo inválido (amount negativo) retorna 400", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/support/1/credit-pol`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ amount: -5, reason: "Teste negativo" }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "validation_error");
});

test("HTTP smoke: POST /api/admin/support/1/archive com token de finance retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/support/1/archive`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${financeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ archived: true }),
  });
  assert.equal(res.status, 403);
});
