/**
 * Security regression guard for the legacy email suffix fallback in
 * server/modules/auth/auth.repository.ts.
 *
 * The vulnerability (found and fixed 2026-09-13): `findUserByIdentifier` fell back to
 * `email: { endsWith: input }` ordered by `id desc` when the exact lookup missed. The
 * login schema never validated email shape (it only caps length) and the controller only
 * checked `identifier.includes("@")`, so an unauthenticated caller could resolve an
 * arbitrary account:
 *
 *   POST /auth/login {"identifier": "@gmail.com"}   -> newest Gmail account
 *   POST /auth/login {"identifier": "o@gmail.com"}  -> joao@gmail.com
 *
 * login.controller.ts then calls recordAuthLoginFailure({ ip, userId: thatUser.id }), and
 * the lockout tiers are 5 failures -> 15min, 10 -> 60min. So ten requests locked a stranger
 * out for an hour, with the attacker never learning their address. forgot-password resolves
 * through the same helper.
 *
 * These assert the pure decision rule the fallback now runs, so they need no database.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { hasEmailLocalPart, isVerifiedLegacyEmailMatch, normalizeEmail } = await import(
  "../../server/modules/auth/auth.repository.ts"
);

test("a bare domain suffix has no local part, so the fallback never runs for it", () => {
  for (const attack of ["@gmail.com", "@hotmail.com", "@", ""]) {
    assert.equal(hasEmailLocalPart(normalizeEmail(attack)), false, `"${attack}" must be rejected outright`);
  }
});

test("a real address has a local part and is allowed to reach the fallback", () => {
  for (const ok of ["joao@gmail.com", "a@b.co", " Gustavo@Gmail.com "]) {
    assert.equal(hasEmailLocalPart(normalizeEmail(ok)), true, `"${ok}" should be allowed through`);
  }
});

test("THE ATTACK: a bare domain suffix never confirms a stored account", () => {
  const victim = "joao@gmail.com";
  assert.equal(isVerifiedLegacyEmailMatch(victim, normalizeEmail("@gmail.com")), false);
});

test("THE TARGETED ATTACK: a partial local part never confirms a stored account", () => {
  const victim = "joao@gmail.com";
  // Every suffix of the victim's address that is itself a syntactically valid email.
  for (const attack of ["o@gmail.com", "ao@gmail.com", "oao@gmail.com"]) {
    assert.equal(
      isVerifiedLegacyEmailMatch(victim, normalizeEmail(attack)),
      false,
      `"${attack}" must not resolve ${victim}`,
    );
  }
});

test("the genuine legacy shape (same address, surrounding whitespace) still matches", () => {
  const input = normalizeEmail("gustavo@gmail.com");
  assert.equal(isVerifiedLegacyEmailMatch(" gustavo@gmail.com", input), true);
  assert.equal(isVerifiedLegacyEmailMatch("gustavo@gmail.com\n", input), true);
  assert.equal(isVerifiedLegacyEmailMatch("  GUSTAVO@GMAIL.COM  ", input), true);
});

test("an unrelated address never matches", () => {
  const input = normalizeEmail("gustavo@gmail.com");
  assert.equal(isVerifiedLegacyEmailMatch("outro@gmail.com", input), false);
  assert.equal(isVerifiedLegacyEmailMatch("gustavo@outrodominio.com", input), false);
});

test("null/undefined/garbage stored values never match", () => {
  const input = normalizeEmail("gustavo@gmail.com");
  for (const stored of [null, undefined, 0, {}, []]) {
    assert.equal(isVerifiedLegacyEmailMatch(stored, input), false);
  }
});

test("an empty normalized input never matches anything", () => {
  assert.equal(isVerifiedLegacyEmailMatch("gustavo@gmail.com", ""), false);
  assert.equal(isVerifiedLegacyEmailMatch("", ""), false);
});
