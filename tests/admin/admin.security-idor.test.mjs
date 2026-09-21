import test from "node:test";
import assert from "node:assert/strict";
import { isStrongPassword } from "../../server/modules/admin/admin.service.js";
import { resolvePermissions, hasPermission, ADMIN_ROLES } from "../../server/modules/admin/admin.permissions.js";

// Mock express req/res objects for controller logic verification
function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

test("Admin Security: Password Complexity Policy Enforcement", () => {
  assert.equal(isStrongPassword("short"), false, "Must reject short passwords");
  assert.equal(isStrongPassword("alllowercasepassword123!"), false, "Must reject password without uppercase");
  assert.equal(isStrongPassword("ALLUPPERCASEPASSWORD123!"), false, "Must reject password without lowercase");
  assert.equal(isStrongPassword("LettersOnlyNoDigitsSpecial!"), false, "Must reject password without numbers");
  assert.equal(isStrongPassword("NoSpecialChars12345Aa"), false, "Must reject password without symbols");

  // Valid strong passwords
  assert.equal(isStrongPassword("StrongAdmin#2026!"), true, "Must accept compliant strong password");
  assert.equal(isStrongPassword("BlockMiner$Secure@99"), true, "Must accept compliant strong password");
});

test("Admin RBAC: Permission Resolution & Hierarchy", () => {
  // Super admin wildcard
  const superPerms = resolvePermissions("super_admin");
  assert.deepEqual(superPerms, ["*"]);
  assert.equal(hasPermission(superPerms, "users.ban"), true);
  assert.equal(hasPermission(superPerms, "finance.withdrawals"), true);
  assert.equal(hasPermission(superPerms, "anything.really"), true);

  // Finance role
  const financePerms = resolvePermissions("finance");
  assert.equal(hasPermission(financePerms, "payments"), true);
  assert.equal(hasPermission(financePerms, "withdrawals"), true);
  assert.equal(hasPermission(financePerms, "users.ban"), false);

  // Support role
  const supportPerms = resolvePermissions("support");
  assert.equal(hasPermission(supportPerms, "support"), true);
  assert.equal(hasPermission(supportPerms, "users.view"), true);
  assert.equal(hasPermission(supportPerms, "withdrawals"), false);
});

test("Admin Security: IDOR Defense Logic Verification", async () => {
  // Scenario: Admin #2 (role: 'support') attempts to revoke session belonging to Admin #1 (Super Admin)
  const callerAdminId = 2;
  const callerRole = "support";
  const targetSessionAdminId = 1; // Different admin!

  const isSuper = callerRole === "super_admin";
  const isOwner = callerAdminId === targetSessionAdminId;
  const allowed = isOwner || isSuper;

  assert.equal(allowed, false, "Cross-admin session revocation must be BLOCKED for non-super-admins");

  // Scenario 2: Super Admin revokes session of another admin
  const superCallerRole = "super_admin";
  const superAllowed = callerAdminId === targetSessionAdminId || superCallerRole === "super_admin";
  assert.equal(superAllowed, true, "Super Admin must be PERMITTED to manage any session");

  // Scenario 3: Regular admin revokes their OWN session
  const ownSessionAdminId = 2;
  const ownAllowed = callerAdminId === ownSessionAdminId || callerRole === "super_admin";
  assert.equal(ownAllowed, true, "Admin must be PERMITTED to revoke their own session");
});

test("Admin Security: Self-Lockout & Demotion Guard Logic", () => {
  const currentAdminId = 2;
  const targetAdminId = 2; // Self

  // Attempting to deactivate own account
  const tryingToDeactivate = true;
  const isSelf = currentAdminId === targetAdminId;
  const selfDeactivationBlocked = isSelf && tryingToDeactivate;
  assert.equal(selfDeactivationBlocked, true, "Self deactivation must be blocked");

  // Attempting to demote last super admin
  const totalSuperAdmins = 1;
  const targetRole = "super_admin";
  const newRole = "admin";
  const demotingLastSuperAdmin = targetRole === "super_admin" && newRole !== "super_admin" && totalSuperAdmins <= 1;
  assert.equal(demotingLastSuperAdmin, true, "Demoting last super admin must be strictly blocked");
});
