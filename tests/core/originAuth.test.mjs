import test from "node:test";
import assert from "node:assert/strict";

const { createOriginAuthMiddleware, isOriginRequestAllowed, ORIGIN_AUTH_HEADER } = await import(
  "../../server/core/http/middleware/originAuth.ts"
);

function run(req, secret) {
  const prev = process.env.ORIGIN_AUTH_SECRET;
  if (secret === undefined) delete process.env.ORIGIN_AUTH_SECRET;
  else process.env.ORIGIN_AUTH_SECRET = secret;
  try {
    let nextCalled = false;
    const res = {
      statusCode: 200,
      body: null,
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(b) {
        this.body = b;
        return this;
      },
    };
    createOriginAuthMiddleware()(
      { method: "GET", path: "/api/x", socket: {}, ...req, headers: { ...(req.headers ?? {}) } },
      res,
      () => {
        nextCalled = true;
      },
    );
    return { nextCalled, res };
  } finally {
    if (prev === undefined) delete process.env.ORIGIN_AUTH_SECRET;
    else process.env.ORIGIN_AUTH_SECRET = prev;
  }
}

test("disabled when ORIGIN_AUTH_SECRET is empty", () => {
  assert.equal(run({}, undefined).nextCalled, true);
  assert.equal(run({}, "").nextCalled, true);
});

test("rejects requests without the header (direct origin access)", () => {
  const { nextCalled, res } = run({ path: "/zeradsptc.php" }, "edge-secret");
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.code, "ORIGIN_FORBIDDEN");
});

test("rejects a wrong header value", () => {
  const { nextCalled } = run({ headers: { [ORIGIN_AUTH_HEADER]: "edge-secreT" } }, "edge-secret");
  assert.equal(nextCalled, false);
});

test("accepts the matching header and strips it from the request", () => {
  const headers = { [ORIGIN_AUTH_HEADER]: "edge-secret" };
  const req = { method: "GET", path: "/api/offerwallme/postback", socket: {}, headers };
  const prev = process.env.ORIGIN_AUTH_SECRET;
  process.env.ORIGIN_AUTH_SECRET = "edge-secret";
  try {
    let nextCalled = false;
    createOriginAuthMiddleware()(req, {}, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
    assert.equal(req.headers[ORIGIN_AUTH_HEADER], undefined);
  } finally {
    if (prev === undefined) delete process.env.ORIGIN_AUTH_SECRET;
    else process.env.ORIGIN_AUTH_SECRET = prev;
  }
});

test("container healthcheck paths stay reachable without the header", () => {
  assert.equal(run({ path: "/health" }, "edge-secret").nextCalled, true);
  assert.equal(run({ path: "/health/ready" }, "edge-secret").nextCalled, true);
  assert.equal(run({ path: "/api/health" }, "edge-secret").nextCalled, false);
});

test("isOriginRequestAllowed mirrors the middleware for Socket.IO handshakes", () => {
  const prev = process.env.ORIGIN_AUTH_SECRET;
  try {
    delete process.env.ORIGIN_AUTH_SECRET;
    assert.equal(isOriginRequestAllowed({}), true);
    process.env.ORIGIN_AUTH_SECRET = "edge-secret";
    assert.equal(isOriginRequestAllowed({}), false);
    assert.equal(isOriginRequestAllowed({ [ORIGIN_AUTH_HEADER]: "edge-secret" }), true);
  } finally {
    if (prev === undefined) delete process.env.ORIGIN_AUTH_SECRET;
    else process.env.ORIGIN_AUTH_SECRET = prev;
  }
});
