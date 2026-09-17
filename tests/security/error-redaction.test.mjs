/**
 * Security regression suite for the error-collection redaction layer.
 *
 * Every case here maps to "não vazar senha / token / API key / dados sensíveis"
 * in the logging checklist. A failure in this file means secrets are reaching
 * log lines — treat it as a security incident, not a broken unit test.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { redactContext, fingerprintError, newErrorId } = await import(
  "../../server/core/errors/error-reporter.ts"
);

const REDACTED = "[REDACTED]";

// ─── key-based redaction ─────────────────────────────────────────────────────

test("redacts secret-named keys at the top level", () => {
  const out = redactContext({
    password: "hunter2",
    apiKey: "abc123",
    api_key: "abc123",
    refreshToken: "rt_live",
    authorization: "Basic Zm9v",
    cookie: "sid=1",
    privateKey: "0xdead",
    seed: "word word word",
    mnemonic: "word word word",
    otp: "123456",
    cvv: "999",
    userId: 42,
  });

  for (const key of [
    "password",
    "apiKey",
    "api_key",
    "refreshToken",
    "authorization",
    "cookie",
    "privateKey",
    "seed",
    "mnemonic",
    "otp",
    "cvv",
  ]) {
    assert.equal(out[key], REDACTED, `${key} must be redacted`);
  }
  assert.equal(out.userId, 42, "non-secret context must survive");
});

test("redacts secrets nested inside plain objects", () => {
  const out = redactContext({ user: { id: 1, profile: { password: "hunter2" } } });
  assert.equal(out.user.profile.password, REDACTED);
  assert.equal(out.user.id, 1);
});

// ─── regression: arrays used to bypass redaction entirely ───────────────────

test("REGRESSION: secrets inside an array of objects are redacted", () => {
  const out = redactContext({ items: [{ id: 1, password: "hunter2" }, { id: 2, token: "t" }] });
  assert.equal(out.items[0].password, REDACTED);
  assert.equal(out.items[1].token, REDACTED);
  assert.equal(out.items[0].id, 1, "non-secret siblings must survive");
});

test("REGRESSION: an array stored under a secret key is redacted wholesale", () => {
  const out = redactContext({ tokens: ["a", "b", "c"] });
  assert.equal(out.tokens, REDACTED);
});

test("REGRESSION: secrets nested in arrays of arrays are redacted", () => {
  const out = redactContext({ batches: [[{ apiKey: "k" }]] });
  assert.equal(out.batches[0][0].apiKey, REDACTED);
});

// ─── value-shaped secrets under innocent keys ───────────────────────────────

test("redacts a JWT that arrives as a value under a harmless key", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(redactContext({ callbackUrl: jwt }).callbackUrl, REDACTED);
  assert.equal(
    redactContext({ note: `redirect to /cb?access_token=${jwt}&x=1` }).note,
    REDACTED,
    "a JWT embedded mid-string must still be caught",
  );
});

test("redacts a raw Authorization value and a PEM private key block", () => {
  assert.equal(redactContext({ header: "Bearer eyJhbGciOi.x.y" }).header, REDACTED);
  assert.equal(
    redactContext({ blob: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n" }).blob,
    REDACTED,
  );
});

// ─── false-positive guard: legitimate Web3 context must survive ─────────────

test("does NOT redact blockchain context that incident response needs", () => {
  const out = redactContext({
    txHash: "0x88df016429689c079f3b2f6ad39fa052532c56795b733da78a91ebe6a713944b",
    walletAddress: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    blockNumber: 19_000_000,
    chainId: 137,
    rpcProvider: "polygon-mainnet",
  });
  assert.match(out.txHash, /^0x88df/);
  assert.match(out.walletAddress, /^0x742d/);
  assert.equal(out.blockNumber, 19_000_000);
  assert.equal(out.rpcProvider, "polygon-mainnet");
});

// ─── resource-exhaustion guards ─────────────────────────────────────────────

test("survives a circular reference instead of blowing the stack", () => {
  const node = { id: 1 };
  node.self = node;
  const out = redactContext({ node });
  assert.equal(out.node.id, 1);
  assert.equal(out.node.self, "[CIRCULAR]");
});

test("truncates beyond the depth cap", () => {
  let deep = { leaf: "bottom" };
  for (let i = 0; i < 12; i++) deep = { nested: deep };
  const out = redactContext({ deep });
  assert.ok(JSON.stringify(out).includes("[TRUNCATED]"), "deep nesting must be cut off");
});

test("truncates oversized strings so one report cannot flood the log", () => {
  const out = redactContext({ blob: "x".repeat(5000) });
  assert.ok(out.blob.length < 700);
  assert.match(out.blob, /truncated \d+ chars/);
});

// ─── shape normalisation ────────────────────────────────────────────────────

test("normalises Date and Error values into loggable shapes", () => {
  const out = redactContext({
    at: new Date("2026-09-17T00:00:00.000Z"),
    err: new Error("boom"),
  });
  assert.equal(out.at, "2026-09-17T00:00:00.000Z");
  assert.deepEqual(out.err, { name: "Error", message: "boom" });
});

test("an Error message carrying a token is redacted too", () => {
  const out = redactContext({
    err: new Error("upstream rejected Bearer eyJhbGciOi.abc.def"),
  });
  assert.equal(out.err.message, REDACTED);
});

test("redactContext tolerates undefined", () => {
  assert.deepEqual(redactContext(undefined), {});
});

// ─── grouping and occurrence identity ───────────────────────────────────────

test("fingerprint is stable for the same problem and differs across problems", () => {
  const a = { code: "X_FAILED", category: "BUSINESS", module: "tournaments" };
  assert.equal(fingerprintError(a), fingerprintError({ ...a }));
  assert.notEqual(fingerprintError(a), fingerprintError({ ...a, module: "wallet" }));
  assert.notEqual(fingerprintError(a), fingerprintError({ ...a, code: "Y_FAILED" }));
  assert.match(fingerprintError(a), /^fp_[0-9a-f]{10}$/);
});

test("error ids are unique per occurrence and sort chronologically", () => {
  const ids = new Set(Array.from({ length: 500 }, () => newErrorId()));
  assert.equal(ids.size, 500, "error ids must not collide");

  const early = newErrorId(new Date("2026-01-01T00:00:00Z"));
  const late = newErrorId(new Date("2026-06-01T00:00:00Z"));
  assert.ok(early < late, "time-prefixed ids must sort chronologically");
  assert.match(early, /^err_[0-9a-z]+[0-9a-f]{10}$/);
});
