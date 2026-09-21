import test from "node:test";
import assert from "node:assert/strict";

const adminSvc = await import("../../server/modules/admin/admin.service.ts");

test("isStrongPassword requires length >= 12 and character classes", () => {
  assert.equal(adminSvc.isStrongPassword("Short1!"), false);
  assert.equal(adminSvc.isStrongPassword("alllowercase12!"), false);
  assert.equal(adminSvc.isStrongPassword("ALLUPPERCASE12!"), false);
  assert.equal(adminSvc.isStrongPassword("NoSymbols12345"), false);
  assert.equal(adminSvc.isStrongPassword("NoNumbers!@#$%"), false);
  assert.equal(adminSvc.isStrongPassword("SuperSecure123!@#"), true);
  assert.equal(adminSvc.isStrongPassword("AdminPass_2026"), true);
});

test("toPublic strips passwordHash and resolves permissions", () => {
  const fakeAdmin = {
    id: 1,
    name: "Fraga",
    email: "fraga@blockminer.space",
    passwordHash: "$2a$12$abcdefg",
    role: "super_admin",
    permissions: null,
    isActive: true,
    lastLoginAt: new Date(),
    lastLoginIp: "127.0.0.1",
    lastLoginUa: "Mozilla/5.0",
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: null,
    updatedById: null,
  };

  const pub = adminSvc.toPublic(fakeAdmin);
  assert.equal(pub.id, 1);
  assert.equal(pub.name, "Fraga");
  assert.equal(pub.email, "fraga@blockminer.space");
  assert.equal(pub.role, "super_admin");
  assert.equal("passwordHash" in pub, false);
  assert.ok(Array.isArray(pub.permissions));
  assert.ok(pub.permissions.includes("*"));
});
