import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  withdrawalAdminIdParamSchema,
  completeWithdrawalSchema,
} from "../../server/modules/wallet/withdrawal/withdrawal.schemas.ts";

describe("Admin Finance Schemas & 32-bit Clamping Validation", () => {
  it("withdrawalAdminIdParamSchema validates positive integer IDs and clamps 32-bit integer", () => {
    const validIds = ["1", "42", "2147483647", 100];
    for (const id of validIds) {
      const res = withdrawalAdminIdParamSchema.safeParse({ withdrawalId: id });
      assert.ok(res.success, `Expected ${id} to be valid`);
      assert.equal(typeof res.data.withdrawalId, "number");
    }

    const invalidIds = ["0", "-1", "-999", "abc", "1.5", "2147483648", "9999999999999999"];
    for (const id of invalidIds) {
      const res = withdrawalAdminIdParamSchema.safeParse({ withdrawalId: id });
      assert.equal(res.success, false, `Expected ${id} to be rejected`);
    }
  });

  it("withdrawalAdminIdParamSchema rejects mass assignment with .strict()", () => {
    const res = withdrawalAdminIdParamSchema.safeParse({
      withdrawalId: 42,
      injectedRole: "admin",
    });
    assert.equal(res.success, false, "Expected extra fields to be rejected by .strict()");
  });

  it("completeWithdrawalSchema validates clean Polygon 0x + 64 hex characters", () => {
    const validHash = "0x" + "abcdef0123456789".repeat(4);
    const res = completeWithdrawalSchema.safeParse({ txHash: validHash });
    assert.ok(res.success, "Valid txHash should pass");
    assert.equal(res.data.txHash, validHash);
  });

  it("completeWithdrawalSchema rejects malformed hashes, missing 0x, non-hex characters and XSS", () => {
    const badHashes = [
      "",
      "a".repeat(64), // missing 0x
      "0x" + "z".repeat(64), // non-hex
      "0x1234", // too short
      "<script>alert(1)</script>", // XSS
      "0x" + "a".repeat(63), // 63 hex instead of 64
      "0x" + "a".repeat(65), // 65 hex instead of 64
    ];

    for (const bad of badHashes) {
      const res = completeWithdrawalSchema.safeParse({ txHash: bad });
      assert.equal(res.success, false, `Expected ${bad} to be rejected`);
    }
  });

  it("completeWithdrawalSchema enforces .strict() against mass assignment", () => {
    const validHash = "0x" + "1".repeat(64);
    const res = completeWithdrawalSchema.safeParse({
      txHash: validHash,
      statusOverride: "completed",
      autoSendBypass: true,
    });
    assert.equal(res.success, false, "Expected .strict() to reject injected fields");
  });
});
