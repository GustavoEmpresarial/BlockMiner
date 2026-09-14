import test from "node:test";
import assert from "node:assert/strict";

// Unit tests for turnstile.ts (zero prior coverage despite having an injectable fetchImpl
// seam designed exactly for this, same convention as telegram.worker.ts's tests).

const turnstile = await import("../../server/shared/security/turnstile.ts");

async function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) prev[k] = process.env[k];
  Object.assign(process.env, vars);
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

test("resolveTurnstileSecret: falls back to the generic secret when no purpose-specific one is set", () => {
  withEnv(
    {
      TURNSTILE_SECRET_KEY: "generic",
      TURNSTILE_SECRET_KEY_LOGIN: "",
      TURNSTILE_SECRET_KEY_REGISTER: "",
      TURNSTILE_SECRET_KEY_FORGOT: "",
    },
    () => {
      assert.equal(turnstile.resolveTurnstileSecret("login"), "generic");
      assert.equal(turnstile.resolveTurnstileSecret("register"), "generic");
      assert.equal(turnstile.resolveTurnstileSecret("forgot"), "generic");
      assert.equal(turnstile.resolveTurnstileSecret(undefined), "generic");
    },
  );
});

test("resolveTurnstileSecret: a purpose-specific secret takes precedence over the generic one", () => {
  withEnv({ TURNSTILE_SECRET_KEY: "generic", TURNSTILE_SECRET_KEY_LOGIN: "login-only" }, () => {
    assert.equal(turnstile.resolveTurnstileSecret("login"), "login-only");
    assert.equal(turnstile.resolveTurnstileSecret("register"), "generic");
    assert.equal(turnstile.resolveTurnstileSecret("forgot"), "generic");
  });
});

test("resolveTurnstileSecret: TURNSTILE_SECRET_KEY_FORGOT wins for purpose forgot", () => {
  withEnv({ TURNSTILE_SECRET_KEY: "generic", TURNSTILE_SECRET_KEY_FORGOT: "forgot-only" }, () => {
    assert.equal(turnstile.resolveTurnstileSecret("forgot"), "forgot-only");
    assert.equal(turnstile.resolveTurnstileSecret("login"), "generic");
  });
});

test("isTurnstileEnforced: false when no secret at all is configured (today's production default)", () => {
  withEnv(
    {
      TURNSTILE_SECRET_KEY: "",
      TURNSTILE_SECRET_KEY_LOGIN: "",
      TURNSTILE_SECRET_KEY_REGISTER: "",
      TURNSTILE_SECRET_KEY_FORGOT: "",
    },
    () => {
      assert.equal(turnstile.isTurnstileEnforced(), false);
    },
  );
});

test("isTurnstileEnforced: true if only the forgot secret is set", () => {
  withEnv(
    {
      TURNSTILE_SECRET_KEY: "",
      TURNSTILE_SECRET_KEY_LOGIN: "",
      TURNSTILE_SECRET_KEY_REGISTER: "",
      TURNSTILE_SECRET_KEY_FORGOT: "forgot-secret",
    },
    () => {
      assert.equal(turnstile.isTurnstileEnforced(), true);
    },
  );
});

test("isTurnstileEnforced: true if even just one purpose-specific secret is set", () => {
  withEnv({ TURNSTILE_SECRET_KEY: "", TURNSTILE_SECRET_KEY_LOGIN: "", TURNSTILE_SECRET_KEY_REGISTER: "reg-secret" }, () => {
    assert.equal(turnstile.isTurnstileEnforced(), true);
  });
});

test("verifyTurnstileToken: {ok:true} no-op when no secret is configured, without ever calling fetch", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error("must never be called");
  };
  const result = await turnstile.verifyTurnstileToken("any-token", "1.2.3.4", { secret: "", fetchImpl });
  assert.deepEqual(result, { ok: true });
  assert.equal(called, false);
});

test("verifyTurnstileToken: CAPTCHA_REQUIRED for a missing/blank token, without calling fetch", async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return { json: async () => ({ success: true }) };
  };
  const result = await turnstile.verifyTurnstileToken("   ", "1.2.3.4", { secret: "s", fetchImpl });
  assert.deepEqual(result, { ok: false, code: "CAPTCHA_REQUIRED" });
  assert.equal(called, false);
});

test("verifyTurnstileToken: {ok:true} when Cloudflare siteverify returns success:true", async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return { json: async () => ({ success: true }) };
  };
  const result = await turnstile.verifyTurnstileToken("real-token", "9.9.9.9", { secret: "s", fetchImpl });
  assert.deepEqual(result, { ok: true });
  assert.equal(captured.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(captured.init.method, "POST");
  const body = captured.init.body;
  assert.equal(body.get("secret"), "s");
  assert.equal(body.get("response"), "real-token");
  assert.equal(body.get("remoteip"), "9.9.9.9");
});

test("verifyTurnstileToken: CAPTCHA_FAILED when Cloudflare siteverify returns success:false", async () => {
  const fetchImpl = async () => ({ json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) });
  const result = await turnstile.verifyTurnstileToken("bad-token", undefined, { secret: "s", fetchImpl });
  assert.deepEqual(result, { ok: false, code: "CAPTCHA_FAILED" });
});

test("verifyTurnstileToken: a malformed (non-JSON-object) response is treated as failure, never throws", async () => {
  const fetchImpl = async () => ({ json: async () => null });
  const result = await turnstile.verifyTurnstileToken("t", undefined, { secret: "s", fetchImpl });
  assert.deepEqual(result, { ok: false, code: "CAPTCHA_FAILED" });
});

test("verifyTurnstileToken: fail-CLOSED (CAPTCHA_FAILED) on a network error when TURNSTILE_FAIL_OPEN is not set", async () => {
  await withEnv({ TURNSTILE_FAIL_OPEN: "" }, async () => {
    const fetchImpl = async () => {
      throw new Error("network down");
    };
    const result = await turnstile.verifyTurnstileToken("t", undefined, { secret: "s", fetchImpl });
    assert.deepEqual(result, { ok: false, code: "CAPTCHA_FAILED" });
  });
});

test("verifyTurnstileToken: fail-OPEN ({ok:true}) on a network error when TURNSTILE_FAIL_OPEN=1", async () => {
  await withEnv({ TURNSTILE_FAIL_OPEN: "1" }, async () => {
    const fetchImpl = async () => {
      throw new Error("network down");
    };
    const result = await turnstile.verifyTurnstileToken("t", undefined, { secret: "s", fetchImpl });
    assert.deepEqual(result, { ok: true });
  });
});

test("requireTurnstileWhenConfigured: calls next() with no response when no secret is configured", async () => {
  await withEnv({ TURNSTILE_SECRET_KEY: "", TURNSTILE_SECRET_KEY_LOGIN: "", TURNSTILE_SECRET_KEY_REGISTER: "" }, async () => {
    const middleware = turnstile.requireTurnstileWhenConfigured();
    let nextCalled = false;
    const req = { body: {}, headers: {}, path: "/auth/login" };
    const res = { status: () => { throw new Error("must not respond when disabled"); } };
    await middleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });
});

test("requireTurnstileWhenConfigured: 400 CAPTCHA_REQUIRED when configured but no token is sent", async () => {
  const fetchImpl = async () => ({ json: async () => ({ success: true }) });
  const middleware = turnstile.requireTurnstileWhenConfigured({ purpose: "login", fetchImpl });
  const calls = { status: null, json: null };
  const req = { body: {}, headers: {}, path: "/auth/login", ip: "1.1.1.1" };
  const res = {
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.json = body;
      return this;
    },
  };
  await withEnv({ TURNSTILE_SECRET_KEY_LOGIN: "login-secret" }, async () => {
    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(calls.status, 400);
    assert.equal(calls.json.code, "CAPTCHA_REQUIRED");
  });
});

test("requireTurnstileWhenConfigured: purpose forgot returns 400 CAPTCHA_REQUIRED without a token", async () => {
  const fetchImpl = async () => ({ json: async () => ({ success: true }) });
  const middleware = turnstile.requireTurnstileWhenConfigured({ purpose: "forgot", fetchImpl });
  const calls = { status: null, json: null };
  const req = { body: {}, headers: {}, path: "/auth/forgot-password", ip: "4.4.4.4" };
  const res = {
    status(code) {
      calls.status = code;
      return this;
    },
    json(body) {
      calls.json = body;
      return this;
    },
  };
  await withEnv({ TURNSTILE_SECRET_KEY_FORGOT: "forgot-secret" }, async () => {
    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(calls.status, 400);
    assert.equal(calls.json.code, "CAPTCHA_REQUIRED");
  });
});

test("requireTurnstileWhenConfigured: calls next() when configured and the token verifies", async () => {
  const fetchImpl = async () => ({ json: async () => ({ success: true }) });
  const middleware = turnstile.requireTurnstileWhenConfigured({ purpose: "register", fetchImpl });
  const req = { body: { cfTurnstileToken: "good-token" }, headers: {}, path: "/auth/register", ip: "2.2.2.2" };
  const res = { status: () => { throw new Error("must not respond on success"); } };
  await withEnv({ TURNSTILE_SECRET_KEY_REGISTER: "reg-secret" }, async () => {
    let nextCalled = false;
    await middleware(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true);
  });
});

test("requireTurnstileWhenConfigured: reads the token from the x-turnstile-token header when the body doesn't have one", async () => {
  let capturedToken = null;
  const fetchImpl = async (url, init) => {
    capturedToken = init.body.get("response");
    return { json: async () => ({ success: true }) };
  };
  const middleware = turnstile.requireTurnstileWhenConfigured({ purpose: "login", fetchImpl });
  const req = { body: {}, headers: { "x-turnstile-token": "header-token" }, path: "/auth/login", ip: "3.3.3.3" };
  const res = {};
  await withEnv({ TURNSTILE_SECRET_KEY_LOGIN: "login-secret" }, async () => {
    await middleware(req, res, () => {});
    assert.equal(capturedToken, "header-token");
  });
});
