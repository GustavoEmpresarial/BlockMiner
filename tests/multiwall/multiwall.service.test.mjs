import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildMultiwallEmbedUrl,
  parseAllowedIps,
  verifyMultiwallHash,
} from "../../server/modules/multiwall/multiwall.pure.ts";

const SECRET = "test-secret";

function sign(userId, transaction, amount, amountus) {
  return crypto.createHash("md5").update(SECRET + userId + transaction + amount + amountus).digest("hex");
}

test("verifyMultiwallHash: accepts a correctly signed payload", () => {
  const hash = sign("42", "tx1", "0.01", "0.0005");
  assert.equal(verifyMultiwallHash(SECRET, "42", "tx1", "0.01", "0.0005", hash), true);
});

test("verifyMultiwallHash: rejects a tampered payload", () => {
  const hash = sign("42", "tx1", "0.01", "0.0005");
  assert.equal(verifyMultiwallHash(SECRET, "42", "tx1", "9.99", "0.0005", hash), false);
});

test("verifyMultiwallHash: rejects empty secret", () => {
  const hash = sign("42", "tx1", "0.01", "0.0005");
  assert.equal(verifyMultiwallHash("", "42", "tx1", "0.01", "0.0005", hash), false);
});

test("parseAllowedIps: splits configured IPs", () => {
  const set = parseAllowedIps("148.72.132.180, 1.2.3.4");
  assert.equal(set.has("148.72.132.180"), true);
  assert.equal(set.has("1.2.3.4"), true);
  assert.equal(set.has("9.9.9.9"), false);
});

test("buildMultiwallEmbedUrl: PTC api.php query form", () => {
  assert.equal(
    buildMultiwallEmbedUrl({ apiKey: "test-api-key", userId: 99 }),
    "https://multiwall-ads.shop/api.php?page=main&api=test-api-key&id=99",
  );
});

test("buildMultiwallEmbedUrl: respects custom base host", () => {
  assert.equal(
    buildMultiwallEmbedUrl({
      apiKey: "abc",
      userId: 7,
      baseUrl: "https://multiwall-ads.shop/api.php",
    }),
    "https://multiwall-ads.shop/api.php?page=main&api=abc&id=7",
  );
});

test("buildMultiwallEmbedUrl: null without API key", () => {
  assert.equal(buildMultiwallEmbedUrl({ apiKey: "", userId: 1 }), null);
});
