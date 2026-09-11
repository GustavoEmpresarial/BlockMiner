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

test("callback handler rejects wrong/missing password with plain-text '0' from an allowlisted IP", async () => {
  process.env.ZERADS_CALLBACK_PASSWORD = "the-real-secret";
  const req = makeReq({
    headers: { "cf-connecting-ip": "162.0.208.108" },
    query: { pwd: "totally-wrong", user: "someuser", amount: "1", clicks: "5" },
  });
  const res = makeRes();
  await zeradsCallbackHandler(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body, "0");
});

test("callback handler reads client IP from CF-Connecting-IP header (Cloudflare origin)", async () => {
  const req = makeReq({
    headers: { "cf-connecting-ip": "8.8.8.8" },
    ip: "162.0.208.108", // proves the header, not req.ip, decides allow/deny
  });
  const res = makeRes();
  await zeradsCallbackHandler(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body, "0");
});
