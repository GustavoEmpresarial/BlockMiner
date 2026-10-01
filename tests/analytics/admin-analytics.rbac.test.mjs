import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { resolvePermissions, requireAdminPermission } from "../../server/modules/admin/admin.permissions.ts";

const JWT_SECRET = process.env.JWT_SECRET || "default_test_secret_for_local_ci";

function makeReq(role, permissions) {
  return {
    headers: {},
    admin: {
      id: 1,
      role,
      permissions: permissions ?? [],
    },
  };
}

function runGuard(guard, req) {
  return new Promise((resolve) => {
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ status: this.statusCode, body });
      },
    };
    guard(req, res, () => resolve({ next: true }));
  });
}

const analyticsGuard = requireAdminPermission("dashboard", "finance", "monitoring");

test("RBAC: unauthenticated request without admin object returns 401", async () => {
  const req = { headers: {} };
  const out = await runGuard(analyticsGuard, req);
  assert.equal(out.status, 401);
  assert.equal(out.body?.ok, false);
});

test("RBAC: admin without dashboard/finance/monitoring permissions returns 403", async () => {
  const req = makeReq("support", ["support"]); // only support, no dashboard/finance
  const out = await runGuard(analyticsGuard, req);
  assert.equal(out.status, 403);
  assert.equal(out.body?.code, "FORBIDDEN_PERMISSION");
});

test("RBAC: admin with 'dashboard' permission is authorized", async () => {
  const req = makeReq("admin", ["dashboard"]);
  const out = await runGuard(analyticsGuard, req);
  assert.equal(out.next, true);
});

test("RBAC: admin with 'finance' permission is authorized", async () => {
  const req = makeReq("finance", ["finance"]);
  const out = await runGuard(analyticsGuard, req);
  assert.equal(out.next, true);
});

test("RBAC: admin with 'monitoring' permission is authorized", async () => {
  const req = makeReq("operator", ["monitoring"]);
  const out = await runGuard(analyticsGuard, req);
  assert.equal(out.next, true);
});

test("RBAC: super_admin with wildcard '*' is authorized", async () => {
  const req = makeReq("super_admin", ["*"]);
  const out = await runGuard(analyticsGuard, req);
  assert.equal(out.next, true);
});
