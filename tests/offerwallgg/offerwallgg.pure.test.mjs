import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildOfferwallGgEmbedUrl,
  isIpAllowed,
  mapOfferwallGgStatus,
  parseAllowedIps,
  verifyOfferwallGgSignature,
} from "../../server/modules/offerwallgg/offerwallgg.pure.ts";

const SECRET = "test-secret-offerwallgg";

function sign(userId, tx, amount) {
  return crypto.createHmac("sha256", SECRET).update(`${userId}:${tx}:${amount}`).digest("hex");
}

test("verifyOfferwallGgSignature: accepts a correctly signed payload", () => {
  const sig = sign("42", "tx1", "10");
  assert.equal(verifyOfferwallGgSignature(SECRET, "42", "tx1", "10", sig), true);
});

test("verifyOfferwallGgSignature: rejects a tampered amount", () => {
  const sig = sign("42", "tx1", "10");
  assert.equal(verifyOfferwallGgSignature(SECRET, "42", "tx1", "999", sig), false);
});

test("verifyOfferwallGgSignature: rejects empty secret", () => {
  const sig = sign("42", "tx1", "10");
  assert.equal(verifyOfferwallGgSignature("", "42", "tx1", "10", sig), false);
});

test("isIpAllowed: empty allowlist permits any IP", () => {
  const set = parseAllowedIps("");
  assert.equal(isIpAllowed(set, "1.2.3.4"), true);
});

test("isIpAllowed: non-empty allowlist enforces membership", () => {
  const set = parseAllowedIps("1.2.3.4");
  assert.equal(isIpAllowed(set, "1.2.3.4"), true);
  assert.equal(isIpAllowed(set, "9.9.9.9"), false);
});

test("buildOfferwallGgEmbedUrl: uses public key + userId query", () => {
  assert.equal(
    buildOfferwallGgEmbedUrl({ publicKey: "abc123", userId: 99 }),
    "https://offerwall.gg/wall/abc123?userId=99",
  );
});

test("buildOfferwallGgEmbedUrl: null without public key", () => {
  assert.equal(buildOfferwallGgEmbedUrl({ publicKey: "", userId: 1 }), null);
});

test("mapOfferwallGgStatus: credited vs reversed", () => {
  assert.equal(mapOfferwallGgStatus("credited", "5"), 1);
  assert.equal(mapOfferwallGgStatus("reversed", "5"), 2);
  assert.equal(mapOfferwallGgStatus("credited", "-1"), 2);
});
