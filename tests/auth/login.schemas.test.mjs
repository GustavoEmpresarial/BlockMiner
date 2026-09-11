import test from "node:test";
import assert from "node:assert/strict";

const { loginSchema } = await import("../../server/modules/auth/login/login.schemas.ts");

test("loginSchema normalizes identifier to lowercase/trimmed", () => {
  const result = loginSchema.safeParse({ identifier: "  Ana@Gmail.com  ", password: "secret123" });
  assert.equal(result.success, true);
  assert.equal(result.data.identifier, "ana@gmail.com");
});

test("loginSchema rejects empty password", () => {
  const result = loginSchema.safeParse({ identifier: "ana@gmail.com", password: "" });
  assert.equal(result.success, false);
});

test("loginSchema is .strict() — rejects unknown fields", () => {
  const result = loginSchema.safeParse({ identifier: "ana@gmail.com", password: "secret123", extra: "nope" });
  assert.equal(result.success, false);
});
