/** Pure rules of the US$ 1 annual profile-photo license. */
import test from "node:test";
import assert from "node:assert/strict";

const r = await import("../../server/modules/avatar/avatar.rules.ts");
const DAY = 86_400_000;

test("currencies: POL or SHIB only", () => {
  for (const c of ["POL", "SHIB"]) assert.equal(r.isAvatarCurrency(c), true, c);
  for (const c of ["BLK", "ZER", "USDT", "USDC", "BTC", "ETH", "pol", "", null, "POL; DROP TABLE users"]) assert.equal(r.isAvatarCurrency(c), false, String(c));
  assert.deepEqual(Object.keys(r.AVATAR_BALANCE_COLUMN).sort(), [...r.AVATAR_CURRENCIES].sort());
  for (const col of Object.values(r.AVATAR_BALANCE_COLUMN)) assert.match(col, /^[a-z_]+_balance$/);
});

test("amount = US$ 1 / price, rounded UP to 8 decimals", () => {
  assert.equal(r.computeLicenseAmount(1).toFixed(8), "1.00000000");
  assert.equal(r.computeLicenseAmount(0.2).toFixed(8), "5.00000000");
  assert.equal(r.computeLicenseAmount(3).toFixed(8), "0.33333334"); // never 0.33333333 (would undercharge)
  assert.equal(r.computeLicenseAmount(100_000).toFixed(8), "0.00001000");
  assert.equal(r.computeLicenseAmount(0.0000055).toFixed(8), "181818.18181819");
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => r.computeLicenseAmount(bad));
});

test("quote tolerance: the server may not charge more than 2% above what the user confirmed", () => {
  const amt = r.computeLicenseAmount(0.2); // 5
  assert.equal(r.quoteStillValid(amt, "5"), true);
  assert.equal(r.quoteStillValid(amt, 4.95), true);
  assert.equal(r.quoteStillValid(amt, 4.8), false);
  assert.equal(r.quoteStillValid(amt, 50), true, "user saw more than we charge: fine");
  for (const bad of [undefined, "abc", 0, -5]) assert.equal(r.quoteStillValid(amt, bad), false);
});

test("renewal: blocked with > 30 days left; early renewal extends from the current expiry", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  assert.equal(r.nextLicenseExpiry(now, null).toISOString(), new Date(now.getTime() + 365 * DAY).toISOString());
  assert.equal(r.nextLicenseExpiry(now, new Date(now.getTime() + 31 * DAY)), null);
  const soon = new Date(now.getTime() + 10 * DAY);
  assert.equal(r.nextLicenseExpiry(now, soon).toISOString(), new Date(soon.getTime() + 365 * DAY).toISOString());
  const past = new Date(now.getTime() - 100 * DAY);
  assert.equal(r.nextLicenseExpiry(now, past).toISOString(), new Date(now.getTime() + 365 * DAY).toISOString());
});

test("resolveAvatarUrl: only an active, unblocked license with a server-named file shows a photo", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const ok = { path: "a".repeat(32) + ".webp", licenseExpiresAt: new Date(now.getTime() + DAY), uploadBlocked: false };
  assert.equal(r.resolveAvatarUrl(ok, now), `/media/avatars/${"a".repeat(32)}.webp`);
  assert.equal(r.resolveAvatarUrl({ ...ok, licenseExpiresAt: new Date(now.getTime() - 1) }, now), null, "expired");
  assert.equal(r.resolveAvatarUrl({ ...ok, uploadBlocked: true }, now), null, "blocked");
  assert.equal(r.resolveAvatarUrl({ ...ok, path: null }, now), null, "no photo");
  assert.equal(r.resolveAvatarUrl({ ...ok, path: "../../etc/passwd" }, now), null, "traversal");
  assert.equal(r.resolveAvatarUrl({ ...ok, path: "x.svg" }, now), null);
  assert.equal(r.resolveAvatarUrl(null, now), null);
});

test("channel prices are fixed server-side: Offers US$ 1, Settings US$ 1.50", () => {
  assert.deepEqual(r.AVATAR_PRICE_USD, { offers: 1, settings: 1.5 });
  assert.equal(r.computeLicenseAmount(0.2, r.AVATAR_PRICE_USD.settings).toFixed(8), "7.50000000");
  assert.equal(r.computeLicenseAmount(3, 1.5).toFixed(8), "0.50000000");
  assert.equal(r.computeLicenseAmount(0.093, 1).toFixed(8), "10.75268818");
  assert.equal(r.resolveAvatarChannel("offers"), "offers");
  for (const v of [undefined, "", "OFFERS", "free", 1]) assert.equal(r.resolveAvatarChannel(v), "settings");
  assert.throws(() => r.computeLicenseAmount(1, 0));
});
