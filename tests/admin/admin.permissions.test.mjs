import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_ROLES,
  resolvePermissions,
  hasPermission,
} from "../../server/modules/admin/admin.permissions.js";

test("ADMIN_ROLES contains expected RBAC roles", () => {
  assert.ok(ADMIN_ROLES.includes("super_admin"));
  assert.ok(ADMIN_ROLES.includes("admin"));
  assert.ok(ADMIN_ROLES.includes("moderator"));
  assert.ok(ADMIN_ROLES.includes("finance"));
  assert.ok(ADMIN_ROLES.includes("support"));
  assert.ok(ADMIN_ROLES.includes("readonly"));
});

test("resolvePermissions returns role defaults when override is empty", () => {
  const superPerms = resolvePermissions("super_admin");
  assert.deepEqual(superPerms, ["*"]);

  const adminPerms = resolvePermissions("admin");
  assert.ok(adminPerms.includes("dashboard"));
  assert.ok(adminPerms.includes("admins"));
  assert.ok(adminPerms.includes("audit"));

  const unknownPerms = resolvePermissions("non_existent_role");
  assert.deepEqual(unknownPerms, ["dashboard"]);
});

test("resolvePermissions uses custom permissions when provided", () => {
  const custom = resolvePermissions("admin", ["users.view", "support"]);
  assert.deepEqual(custom, ["users.view", "support"]);
});

test("hasPermission handles wildcard and hierarchical checks", () => {
  // Super admin wildcard
  assert.equal(hasPermission(["*"], "admins:write"), true);
  assert.equal(hasPermission(["*"], "anything"), true);

  // Exact match
  assert.equal(hasPermission(["users.view", "support"], "users.view"), true);
  assert.equal(hasPermission(["users.view", "support"], "support"), true);

  // Module level match (users grants users.view)
  assert.equal(hasPermission(["users", "support"], "users.view"), true);
  assert.equal(hasPermission(["users", "support"], "users.ban"), true);

  // Missing permission
  assert.equal(hasPermission(["users"], "finance"), false);
  assert.equal(hasPermission(["readonly"], "admins"), false);
});
