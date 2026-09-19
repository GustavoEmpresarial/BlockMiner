/**
 * Session payload must keep emailVerified. Without it the SPA never shows
 * the resend banner, and withdraw only toasts "Confirme seu e-mail".
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAuthUserPayload } from "../../client/src/shared/auth/parseAuthUser.ts";

const base = { id: 7, name: "Izuna", email: "andersonkfg14@gmail.com", username: "Izuna" };

describe("parseAuthUserPayload emailVerified", () => {
  it("keeps false so unverified accounts can see the resend banner", () => {
    const user = parseAuthUserPayload({ ...base, emailVerified: false });
    assert.equal(user?.emailVerified, false);
  });

  it("keeps true for backfilled accounts", () => {
    const user = parseAuthUserPayload({ ...base, emailVerified: true });
    assert.equal(user?.emailVerified, true);
  });

  it("omits the flag when the session payload has no emailVerified", () => {
    const user = parseAuthUserPayload(base);
    assert.equal(user?.emailVerified, undefined);
    assert.equal("emailVerified" in (user ?? {}), false);
  });
});
