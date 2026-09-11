import test from "node:test";
import assert from "node:assert/strict";

const {
  parseGoogleRedirectUris,
  readGoogleOAuthConfig,
  isAllowedGoogleRedirectUri,
  googlePublicClientConfig,
} = await import("../../server/modules/auth/google/google.config.ts");

test("readGoogleOAuthConfig disabled without secrets", () => {
  const cfg = readGoogleOAuthConfig({ GOOGLE_OAUTH_ENABLED: "1" });
  assert.equal(cfg.enabled, false);
});

test("readGoogleOAuthConfig enabled with client id+secret", () => {
  const cfg = readGoogleOAuthConfig({
    GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "google_sec_y",
    APP_URL: "https://blockminer.space",
  });
  assert.equal(cfg.enabled, true);
  assert.ok(cfg.redirectUris.some((u) => u.includes("blockminer.space")));
  assert.ok(
    isAllowedGoogleRedirectUri("https://dev.blockminer.space/api/auth/google/callback", {
      GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "google_sec_y",
    }),
  );
});

test("googlePublicClientConfig picks redirect for request host and omits secret", () => {
  const pub = googlePublicClientConfig(
    {
      GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
      GOOGLE_CLIENT_SECRET: "google_sec_y",
    },
    { requestHost: "dev.blockminer.space" },
  );
  assert.equal(pub.enabled, true);
  assert.equal(pub.redirectUri, "https://dev.blockminer.space/api/auth/google/callback");
  assert.equal(pub.clientId, "123.apps.googleusercontent.com");
  assert.ok(!("clientSecret" in pub));
  assert.equal(pub.scope, "openid email profile");
});

test("parseGoogleRedirectUris merges env list", () => {
  const uris = parseGoogleRedirectUris({
    GOOGLE_REDIRECT_URIS: "https://custom.example/cb",
  });
  assert.ok(uris.includes("https://custom.example/cb"));
});
