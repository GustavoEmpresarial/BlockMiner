import test from "node:test";
import assert from "node:assert/strict";

const {
  parseSatspayRedirectUris,
  readSatspayOAuthConfig,
  isAllowedSatspayRedirectUri,
  satspayPublicClientConfig,
} = await import("../../server/modules/auth/satspay/satspay.config.ts");

const {
  sanitizeSatspayUsername,
  parseSatspayUserInfo,
  pickDisplayName,
} = await import("../../server/modules/auth/satspay/satspay.pure.ts");

test("sanitizeSatspayUsername keeps safe slug", () => {
  assert.equal(sanitizeSatspayUsername("Elon_Musk-BR!"), "elon_musk_br");
  assert.ok(sanitizeSatspayUsername("ab").startsWith("sats_"));
});

test("parseSatspayUserInfo requires sub/id and normalizes email", () => {
  assert.equal(parseSatspayUserInfo(null), null);
  const info = parseSatspayUserInfo({
    sub: "018f-sub",
    email: "  Foo@Bar.COM ",
    email_verified: true,
    username: "elonmuskbr",
  });
  assert.equal(info?.sub, "018f-sub");
  assert.equal(info?.email, "foo@bar.com");
  assert.equal(info?.email_verified, true);
  assert.equal(pickDisplayName(info), "elonmuskbr");
});

test("readSatspayOAuthConfig disabled without secrets", () => {
  const cfg = readSatspayOAuthConfig({ SATSPAY_OAUTH_ENABLED: "1" });
  assert.equal(cfg.enabled, false);
});

test("readSatspayOAuthConfig enabled with client id+secret", () => {
  const cfg = readSatspayOAuthConfig({
    SATSPAY_CLIENT_ID: "sats_app_x",
    SATSPAY_CLIENT_SECRET: "sats_sec_y",
    APP_URL: "https://blockminer.space",
  });
  assert.equal(cfg.enabled, true);
  assert.ok(cfg.redirectUris.some((u) => u.includes("blockminer.space")));
  assert.ok(isAllowedSatspayRedirectUri("https://dev.blockminer.space/api/auth/satspay/callback", {
    SATSPAY_CLIENT_ID: "sats_app_x",
    SATSPAY_CLIENT_SECRET: "sats_sec_y",
  }));
});

test("satspayPublicClientConfig picks redirect for request host", () => {
  const pub = satspayPublicClientConfig(
    {
      SATSPAY_CLIENT_ID: "sats_app_x",
      SATSPAY_CLIENT_SECRET: "sats_sec_y",
    },
    { requestHost: "dev.blockminer.space" },
  );
  assert.equal(pub.enabled, true);
  assert.equal(pub.redirectUri, "https://dev.blockminer.space/api/auth/satspay/callback");
  assert.equal(pub.clientId, "sats_app_x");
  assert.ok(!("clientSecret" in pub));
});

test("parseSatspayRedirectUris merges env list", () => {
  const uris = parseSatspayRedirectUris({
    SATSPAY_REDIRECT_URIS: "https://custom.example/cb",
  });
  assert.ok(uris.includes("https://custom.example/cb"));
});
