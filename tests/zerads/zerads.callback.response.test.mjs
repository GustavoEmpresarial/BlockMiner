import test from "node:test";
import assert from "node:assert/strict";

const { zeradsCallbackHandler } = await import("../../server/modules/zerads/zerads.controller.ts");

function makeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
  return res;
}

function makeReq(overrides = {}) {
  return {
    headers: {},
    query: {},
    ip: "9.9.9.9",
    ...overrides,
  };
}

test("callback handler rejects unknown IP with plain-text '0' (403), never JSON", async () => {
  const req = makeReq({ ip: "203.0.113.5" });
  const res = makeRes();
  await zeradsCallbackHandler(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body, "0");
  assert.equal(typeof res.body, "string");
});

/** Request as forwarded by the in-stack nginx (Docker bridge peer). */
const PROXY_PEER = "172.18.0.5";

async function withTrustProxy(fn) {
  const prev = process.env.TRUST_PROXY;
  process.env.TRUST_PROXY = "true";
  try {
    await fn();
  } finally {
    if (prev === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prev;
  }
}

test("callback handler rejects wrong/missing password with plain-text '0' from an allowlisted IP", async () => {
  process.env.ZERADS_CALLBACK_PASSWORD = "the-real-secret";
  await withTrustProxy(async () => {
    const req = makeReq({
      headers: { "cf-connecting-ip": "162.0.208.108" },
      socket: { remoteAddress: PROXY_PEER },
      query: { pwd: "totally-wrong", user: "someuser", amount: "1", clicks: "5" },
    });
    const res = makeRes();
    await zeradsCallbackHandler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body, "0");
  });
});

test("callback handler reads client IP from CF-Connecting-IP when forwarded by the trusted proxy", async () => {
  await withTrustProxy(async () => {
    const req = makeReq({
      headers: { "cf-connecting-ip": "8.8.8.8" },
      socket: { remoteAddress: PROXY_PEER },
    });
    const res = makeRes();
    await zeradsCallbackHandler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body, "0");
  });
});

test("callback handler ignores a forged CF-Connecting-IP sent straight to the origin", async () => {
  process.env.ZERADS_CALLBACK_PASSWORD = "the-real-secret";
  await withTrustProxy(async () => {
    const req = makeReq({
      headers: { "cf-connecting-ip": "162.0.208.108" },
      socket: { remoteAddress: "203.0.113.5" },
      query: { pwd: "the-real-secret", user: "someuser", amount: "1", clicks: "5" },
    });
    const res = makeRes();
    await zeradsCallbackHandler(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body, "0");
  });
});
