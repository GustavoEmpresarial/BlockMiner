import test from "node:test";
import assert from "node:assert/strict";
import { resolvePermissions, hasPermission } from "../../server/modules/admin/admin.permissions.js";
import { isStrongPassword, hashAdminPassword, verifyAdminPassword } from "../../server/modules/admin/admin.service.js";

test("PERFORMANCE: RBAC Permission Evaluation Throughput (100,000 checks)", () => {
  const adminPermissions = resolvePermissions("admin");
  const t0 = performance.now();
  const iterations = 100_000;

  for (let i = 0; i < iterations; i++) {
    hasPermission(adminPermissions, "users.view");
    hasPermission(adminPermissions, "finance.withdrawals");
    hasPermission(adminPermissions, "admins.manage");
  }

  const elapsedMs = performance.now() - t0;
  const opsPerSec = Math.round((iterations * 3 * 1000) / elapsedMs);
  console.log(`[Benchmark] RBAC hasPermission 300k checks: ${elapsedMs.toFixed(2)}ms (${opsPerSec.toLocaleString()} ops/sec)`);

  assert.ok(elapsedMs < 100, `RBAC check took ${elapsedMs}ms, expected < 100ms for 300k evaluations`);
});

test("PERFORMANCE: Password Policy Evaluation Throughput (50,000 checks)", () => {
  const passwords = [
    "Short1!",
    "ValidSuperAdmin#2026!",
    "AnotherGoodPassword$99",
    "InvalidNoSpecial12345",
  ];

  const t0 = performance.now();
  const iterations = 50_000;
  for (let i = 0; i < iterations; i++) {
    const pwd = passwords[i % passwords.length];
    isStrongPassword(pwd);
  }

  const elapsedMs = performance.now() - t0;
  const opsPerSec = Math.round((iterations * 1000) / elapsedMs);
  console.log(`[Benchmark] isStrongPassword 50k checks: ${elapsedMs.toFixed(2)}ms (${opsPerSec.toLocaleString()} ops/sec)`);

  assert.ok(elapsedMs < 100, `Password policy check took ${elapsedMs}ms, expected < 100ms`);
});

test("PERFORMANCE & SECURITY: Admin Password Hashing (bcrypt cost 12)", async () => {
  const plain = "SuperSecretAdmin#2026!";
  const t0 = performance.now();

  const hash = await hashAdminPassword(plain);
  const hashTimeMs = performance.now() - t0;

  assert.ok(hash.startsWith("$2"), "Hash must be valid bcrypt format");
  // Bcrypt cost 12 should take between 100ms and 600ms on modern CPU, providing high resistance to GPU brute-force
  console.log(`[Benchmark] bcrypt cost 12 hash timing: ${hashTimeMs.toFixed(2)}ms (GPU brute-force defense tier)`);

  const tVerify0 = performance.now();
  const isValid = await verifyAdminPassword(plain, hash);
  const verifyTimeMs = performance.now() - tVerify0;

  assert.equal(isValid, true);
  console.log(`[Benchmark] bcrypt cost 12 verify timing: ${verifyTimeMs.toFixed(2)}ms`);

  assert.ok(hashTimeMs > 30, "Bcrypt cost factor 12 must require non-trivial CPU work to thwart brute-force");
});
