import test from "node:test";
import assert from "node:assert/strict";

const { hashPassword, comparePassword, compareDummyPassword } = await import(
  "../../server/shared/security/password.ts"
);

test("hashPassword produces a bcrypt hash that comparePassword verifies", async () => {
  const hash = await hashPassword("correct horse battery staple", 4);
  assert.ok(hash.startsWith("$2"));
  assert.equal(await comparePassword("correct horse battery staple", hash), true);
  assert.equal(await comparePassword("wrong password", hash), false);
});

test("compareDummyPassword always resolves false (timing-attack mitigation)", async () => {
  assert.equal(await compareDummyPassword("anything"), false);
});
