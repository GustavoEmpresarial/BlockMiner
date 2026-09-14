import test from "node:test";
import assert from "node:assert/strict";

const { responseRequiresTwoFactorStep, responseRequiresPasswordStepRestart } = await import(
  "../../client/src/features/auth/login/lib/login.twoFactorUi.ts"
);

test("responseRequiresTwoFactorStep: require2FA true or TWO_FACTOR_REQUIRED", () => {
  assert.equal(responseRequiresTwoFactorStep({ require2FA: true }), true);
  assert.equal(responseRequiresTwoFactorStep({ code: "TWO_FACTOR_REQUIRED" }), true);
  assert.equal(responseRequiresTwoFactorStep({ ok: true }), false);
});

test("responseRequiresTwoFactorStep: TWO_FACTOR_CHALLENGE_REQUIRED is not a 2FA-step entry", () => {
  assert.equal(responseRequiresTwoFactorStep({ code: "TWO_FACTOR_CHALLENGE_REQUIRED" }), false);
});

test("responseRequiresPasswordStepRestart: only TWO_FACTOR_CHALLENGE_REQUIRED", () => {
  assert.equal(responseRequiresPasswordStepRestart({ code: "TWO_FACTOR_CHALLENGE_REQUIRED" }), true);
  assert.equal(responseRequiresPasswordStepRestart({ code: "TWO_FACTOR_REQUIRED" }), false);
  assert.equal(responseRequiresPasswordStepRestart({ code: "TWO_FACTOR_EXPIRED" }), false);
});
