import test from "node:test";
import assert from "node:assert/strict";

process.env.BM_CAPTCHA_HMAC_SECRET = process.env.BM_CAPTCHA_HMAC_SECRET || "test-secret-bm-captcha-canvas";
process.env.BM_CAPTCHA_POW_DIFFICULTY = "0";
process.env.BM_CAPTCHA_MIN_SOLVE_MS = "0";
process.env.BM_CAPTCHA_MIN_CLICK_GAP_MS = "0";

const { mintChallengePair, glyphFromSeed } = await import("../../server/modules/bm-captcha/bm-captcha.challenge.ts");
const { verifyChallenge, mintChallenge } = await import("../../server/modules/bm-captcha/bm-captcha.service.ts");
const store = await import("../../server/modules/bm-captcha/bm-captcha.store.ts");

test("glyphFromSeed still deterministic", () => {
  assert.deepEqual(glyphFromSeed("x"), glyphFromSeed("x"));
});

test("mintChallengePair is canvas_click without leaking target ids", () => {
  const { public: pub, secret } = mintChallengePair({
    userId: 9,
    purpose: "offerwall_external",
    provider: "zerads",
  });
  assert.equal(pub.kind, "canvas_click");
  assert.equal(pub.findCount, secret.targetIds.length);
  assert.equal(pub.sprites.length > pub.findCount, true);
  assert.equal("targetIds" in pub, false);
  assert.ok(pub.sprites.every((s) => !("isTarget" in s)));
});

test("verifyChallenge accepts exact target id set", async () => {
  const minted = await mintChallenge({
    userId: 11,
    purpose: "offerwall_external",
    provider: "moneyrain",
  });
  assert.equal(minted.ok, true);
  if (!minted.ok) return;
  const secret = await store.loadChallenge(minted.challenge.challengeId);
  assert.ok(secret);
  const now = Date.now();
  const clicks = secret.targetIds.map((id, i) => ({
    id,
    x: 1,
    y: 1,
    t: now + i * 250,
  }));
  const result = await verifyChallenge(11, {
    challengeId: minted.challenge.challengeId,
    clicks,
    powCounter: 0,
  });
  assert.equal(result.ok, true);
});

test("verifyChallenge rejects wrong sprite id", async () => {
  const minted = await mintChallenge({
    userId: 12,
    purpose: "offerwall_external",
    provider: "offerwallme",
  });
  assert.equal(minted.ok, true);
  if (!minted.ok) return;
  const secret = await store.loadChallenge(minted.challenge.challengeId);
  assert.ok(secret);
  const decoy = minted.challenge.sprites.find((s) => !secret.targetIds.includes(s.id));
  assert.ok(decoy);
  const now = Date.now();
  const clicks = secret.targetIds.map((id, i) => ({
    id: i === 0 ? decoy.id : id,
    x: 1,
    y: 1,
    t: now + i * 250,
  }));
  const result = await verifyChallenge(12, {
    challengeId: minted.challenge.challengeId,
    clicks,
    powCounter: 0,
  });
  assert.equal(result.ok, false);
});
