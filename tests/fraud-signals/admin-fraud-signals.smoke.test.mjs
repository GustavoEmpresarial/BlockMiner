import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import "../_env-test-overrides.mjs";
import { fraudSignalsAdminRouter } from "../../server/modules/admin/admin.fraud-signals.routes.ts";
import prisma from "../../server/core/database/prisma.ts";

const PORT = 5128;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "default_test_secret_for_local_ci";

const adminToken = jwt.sign(
  { role: "admin", type: "admin_session", permissions: ["fraud_signals", "fraud_signals.view"] },
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
  await prisma.callbackQueue.deleteMany({
    where: {
      callbackType: "SEC_SW_RL",
    },
  }).catch(() => undefined);

  const app = express();
  app.use(express.json());
  app.use("/api/admin/fraud-signals", fraudSignalsAdminRouter);

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

test("HTTP smoke: GET /api/admin/fraud-signals sem token retorna 401", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/fraud-signals`);
  assert.equal(res.status, 401);
});

test("HTTP smoke: GET /api/admin/fraud-signals com token financeiro retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/fraud-signals`, {
    headers: { Authorization: `Bearer ${financeToken}` },
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: GET /api/admin/fraud-signals com token admin retorna 200 ok", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/fraud-signals`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.signals), true);
});

test("HTTP smoke: GET /api/admin/fraud-signals com escopo inválido retorna 400 validation_error", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/fraud-signals?scope=invalid_scope`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "validation_error");
});

test("HTTP smoke: POST /api/admin/fraud-signals/refresh-ip sem token retorna 401", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/fraud-signals/refresh-ip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ip: "198.51.100.1" }),
  });
  assert.equal(res.status, 401);
});

test("HTTP smoke: POST /api/admin/fraud-signals/refresh-ip com token financeiro retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/fraud-signals/refresh-ip`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${financeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ip: "198.51.100.1" }),
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: POST /api/admin/fraud-signals/refresh-ip com corpo inválido (IP vazio) retorna 400", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/fraud-signals/refresh-ip`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ip: "" }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "validation_error");
});

test("HTTP smoke: POST /api/admin/fraud-signals/refresh-ip com IP válido retorna 200 ok", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/fraud-signals/refresh-ip`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ip: "198.51.100.1", forceRefresh: false }),
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.ip, "198.51.100.1");
});

test("HTTP smoke: POST /api/admin/fraud-signals/reset-collection sem token retorna 401", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/fraud-signals/reset-collection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "RESET_FRAUD_COLLECTION" }),
  });
  assert.equal(res.status, 401);
});

test("HTTP smoke: POST /api/admin/fraud-signals/reset-collection com token financeiro retorna 403", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/fraud-signals/reset-collection`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${financeToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirm: "RESET_FRAUD_COLLECTION" }),
  });
  assert.equal(res.status, 403);
});

test("HTTP smoke: POST /api/admin/fraud-signals/reset-collection com frase incorreta retorna 400 phrase_mismatch", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/fraud-signals/reset-collection`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${adminToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ confirm: "WRONG_PHRASE" }),
  });
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.ok, false);
  assert.equal(data.code, "phrase_mismatch");
});
