import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { requireAdminPermission } from "../../server/modules/admin/admin.permissions.js";
import { backupsAdminRouter } from "../../server/modules/admin/admin.backups.routes.js";
import * as backupsSvc from "../../server/modules/admin/admin.backups.service.js";

function createMockReqRes({ admin, query = {}, body = {}, ip = "127.0.0.1" } = {}) {
  const req = {
    admin,
    query,
    body,
    ip,
    headers: { "user-agent": "test-agent" },
  };

  let statusCode = 200;
  let sentData = null;
  let ended = false;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      sentData = data;
      ended = true;
      return res;
    },
    send(data) {
      sentData = data;
      ended = true;
      return res;
    },
    download(path) {
      sentData = { downloadPath: path };
      ended = true;
      return res;
    },
  };

  return {
    req,
    res,
    getStatus: () => statusCode,
    getData: () => sentData,
    isEnded: () => ended,
  };
}

test("RBAC: requireAdminPermission('config') rejects unauthenticated requests with 401", () => {
  const middleware = requireAdminPermission("config");
  const { req, res, getStatus, getData } = createMockReqRes({ admin: null });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 401);
  assert.equal(getData().ok, false);
});

test("RBAC: requireAdminPermission('config') rejects admin without 'config' or '*' with 403", () => {
  const middleware = requireAdminPermission("config");
  // Admin with only "support" and "users.view"
  const { req, res, getStatus, getData } = createMockReqRes({
    admin: {
      adminId: 10,
      email: "support@blockminer.space",
      role: "support",
      permissions: ["support", "users.view"],
    },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(getStatus(), 403);
  assert.equal(getData().code, "FORBIDDEN_PERMISSION");
});

test("RBAC: requireAdminPermission('config') permits admin with 'config' permission", () => {
  const middleware = requireAdminPermission("config");
  const { req, res } = createMockReqRes({
    admin: {
      adminId: 1,
      email: "admin@blockminer.space",
      role: "admin",
      permissions: ["dashboard", "config"],
    },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("RBAC: requireAdminPermission('config') permits super_admin with '*' wildcard", () => {
  const middleware = requireAdminPermission("config");
  const { req, res } = createMockReqRes({
    admin: {
      adminId: 99,
      email: "super@blockminer.space",
      role: "super_admin",
      permissions: ["*"],
    },
  });
  let nextCalled = false;

  middleware(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
});

test("Security: path traversal download attempts are blocked", async () => {
  await assert.rejects(
    () => backupsSvc.resolveBackupDownloadPath("../../etc/shadow"),
    /Invalid backup filename/
  );
  await assert.rejects(
    () => backupsSvc.resolveBackupDownloadPath("backup-../../../etc/passwd.sql"),
    /Invalid backup filename/
  );
  await assert.rejects(
    () => backupsSvc.resolveBackupBundleDownloadPath("../../etc/passwd"),
    /Invalid backup bundle filename/
  );
  await assert.rejects(
    () => backupsSvc.resolveBackupBundleDownloadPath("backup-..%2f..%2f.bundle.tar.gz"),
    /Invalid backup bundle filename/
  );
});

test("Security: deleteSqlBackup blocks path traversal attempts", async () => {
  await assert.rejects(
    () => backupsSvc.deleteSqlBackup("../../../etc/passwd"),
    /Invalid backup filename/
  );
  await assert.rejects(
    () => backupsSvc.deleteSqlBackup("notabackup.sql"),
    /Invalid backup filename/
  );
});
