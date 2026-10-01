import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import "../_env-test-overrides.mjs";
import { usersAdminRouter } from "../../server/modules/users/users.admin.routes.ts";
import prisma from "../../server/core/database/prisma.ts";

const PORT = 5131;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "default_test_secret_for_local_ci";

const adminToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["users", "users.view", "users.ban"] },
  JWT_SECRET,
  { issuer: "blockminer-admin", algorithm: "HS256" }
);

const modToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["users.view", "users.ban"] },
  JWT_SECRET,
  { issuer: "blockminer-admin", algorithm: "HS256" }
);

const readonlyToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["dashboard"] },
  JWT_SECRET,
  { issuer: "blockminer-admin", algorithm: "HS256" }
);

let server;

test.before(async () => {
  await prisma.callbackQueue.deleteMany({
    where: {
      callbackType: { in: ["users_admin_read", "users_admin_write", "users_admin_balance", "users_admin_password"] },
    },
  }).catch(() => undefined);

  const app = express();
  app.use(express.json());
  app.use("/api/admin", usersAdminRouter);

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

test("HTTP smoke: GET /api/admin/users sem token retorna 401", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/users`);
  assert.equal(res.status, 401);
});

test("HTTP smoke: GET /api/admin/users com token readonly (sem users.view) retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${readonlyToken}` },
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: GET /api/admin/users com token admin retorna 200 ok", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.users), true);
});

test("HTTP smoke: GET /api/admin/users/abc com id inválido retorna 400 invalid_id", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/users/abc`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "invalid_id");
});

test("HTTP smoke: GET /api/admin/users/-1 com id negativo retorna 400 invalid_id", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/users/-1`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
});

test("HTTP smoke: POST /api/admin/users/1/adjust-balance com token de moderador retorna 403 (falta permissão users)", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/users/1/adjust-balance`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${modToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ currency: "pol", mode: "add", amount: 10 }),
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: POST /api/admin/users/1/adjust-balance com moeda inválida retorna 400 validation_error", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/users/1/adjust-balance`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ currency: "dogecoin_fake", mode: "add", amount: 10 }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "validation_error");
});

test("HTTP smoke: POST /api/admin/users/1/send-miner com token de moderador retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/users/1/send-miner`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${modToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ minerId: 1, quantity: 1 }),
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: POST /api/admin/users/1/reset-password com token de moderador retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/users/1/reset-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${modToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ newPassword: "password123" }),
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: POST /api/admin/users/1/unlock com token de moderador retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/users/1/unlock`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${modToken}`,
    },
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: POST /api/admin/users/1/ban com token de moderador (possui users.ban) é autorizado além de 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/users/1/ban`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${modToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ reason: "Smoke test ban", days: 1 }),
  });
  // Must NOT be 403 (moderator has users.ban)
  assert.notEqual(res.status, 403);
});
