import test from "node:test";
import assert from "node:assert/strict";

const {
  signOfferwallSubId,
  parseOfferwallSubId,
  OFFERWALL_SUBID_SIG_HEX_LEN,
} = await import("../../server/shared/security/offerwallSubId.ts");

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test("without secret: raw numeric id in and out (signing off)", () => {
  withEnv({ OFFERWALL_SUBID_SECRET: undefined, OFFERWALL_SUBID_ACCEPT_LEGACY: undefined }, () => {
    assert.equal(signOfferwallSubId("offerwallme", 42), "42");
    assert.deepEqual(parseOfferwallSubId("offerwallme", "42"), { ok: true, userId: 42, legacy: false });
  });
});

test("with secret: signed subid round-trips and is alphanumeric", () => {
  withEnv({ OFFERWALL_SUBID_SECRET: "s3cret", OFFERWALL_SUBID_ACCEPT_LEGACY: undefined }, () => {
    const sub = signOfferwallSubId("offerwallgg", 2879);
    assert.match(sub, new RegExp(`^2879x[0-9a-f]{${OFFERWALL_SUBID_SIG_HEX_LEN}}$`));
    assert.deepEqual(parseOfferwallSubId("offerwallgg", sub), { ok: true, userId: 2879, legacy: false });
  });
});

test("with secret: swapping the user id keeps the old signature and is rejected", () => {
  withEnv({ OFFERWALL_SUBID_SECRET: "s3cret" }, () => {
    const sig = signOfferwallSubId("multiwall", 10).split("x")[1];
    const forged = `11x${sig}`;
    assert.deepEqual(parseOfferwallSubId("multiwall", forged), { ok: false, reason: "bad_signature" });
  });
});

test("with secret: a subid signed for one wall is rejected by another", () => {
  withEnv({ OFFERWALL_SUBID_SECRET: "s3cret" }, () => {
    const sub = signOfferwallSubId("moneyrain", 7);
    assert.deepEqual(parseOfferwallSubId("offerwallme", sub), { ok: false, reason: "bad_signature" });
  });
});

test("with secret: raw numeric id rejected unless legacy mode is on", () => {
  withEnv({ OFFERWALL_SUBID_SECRET: "s3cret", OFFERWALL_SUBID_ACCEPT_LEGACY: undefined }, () => {
    assert.deepEqual(parseOfferwallSubId("offerwallme", "42"), { ok: false, reason: "legacy_rejected" });
  });
  withEnv({ OFFERWALL_SUBID_SECRET: "s3cret", OFFERWALL_SUBID_ACCEPT_LEGACY: "1" }, () => {
    assert.deepEqual(parseOfferwallSubId("offerwallme", "42"), { ok: true, userId: 42, legacy: true });
  });
});

test("signed subid without a configured secret cannot be verified", () => {
  const sub = withEnv({ OFFERWALL_SUBID_SECRET: "s3cret" }, () => signOfferwallSubId("offerwallme", 5));
  withEnv({ OFFERWALL_SUBID_SECRET: undefined }, () => {
    assert.deepEqual(parseOfferwallSubId("offerwallme", sub), { ok: false, reason: "bad_signature" });
  });
});

test("malformed input is rejected", () => {
  withEnv({ OFFERWALL_SUBID_SECRET: "s3cret" }, () => {
    for (const raw of ["", "0", "-3", "abc", "12xZZ", "12y00", "1.5", null, undefined]) {
      const res = parseOfferwallSubId("offerwallme", raw);
      assert.equal(res.ok, false, `expected reject for ${String(raw)}`);
    }
  });
});
