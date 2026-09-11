import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

process.env.NODE_ENV = process.env.NODE_ENV || "test";

const { setupHttpStack } = await import("../../server/core/http/setupHttpStack.ts");

function buildApp() {
  const app = express();
  setupHttpStack(app);
  app.get("/", (_req, res) => res.status(200).send("<html><body>ok</body></html>"));
  app.get("/style.css", (_req, res) => res.status(200).send("body{}"));
  app.get("/api/ping", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

async function withServer(fn) {
  const app = buildApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("app route ('/') gets a Content-Security-Policy header with WalletConnect + offerwall allowlist hosts", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/`);
    const csp = res.headers.get("content-security-policy");
    assert.ok(csp, "expected CSP header on an app route");
    assert.match(csp, /relay\.walletconnect\.com/);
    assert.match(csp, /connect-src[^;]*blob:/);
    // Builtin internal-offerwall allowlist host (BUILTIN_IFRAME_HOSTS) must be expanded into frame-src.
    assert.match(csp, /zerads\.com/);
  });
});

test("/api/* routes do NOT get a Content-Security-Policy header", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/ping`);
    assert.equal(res.headers.get("content-security-policy"), null);
  });
});

test("asset paths (e.g. .css) do NOT get a Content-Security-Policy header", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/style.css`);
    assert.equal(res.headers.get("content-security-policy"), null);
  });
});

test("requestContext middleware sets X-Request-Id header", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/ping`);
    assert.ok(res.headers.get("x-request-id"), "expected X-Request-Id header");
  });
});

test("requestContext echoes an incoming X-Request-Id instead of overwriting it", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/ping`, { headers: { "X-Request-Id": "fixed-test-id-123" } });
    assert.equal(res.headers.get("x-request-id"), "fixed-test-id-123");
  });
});

test("our httpsEnforcement middleware does not force a redirect or 403 outside production", async () => {
  await withServer(async (base) => {
    // httpsEnforcement's own enable condition (NODE_ENV === "production") must gate off in
    // dev/test — this asserts the plain-HTTP GET reaches the route handler (200), not a
    // 301 HTTPS redirect or 403 HTTPS_REQUIRED. Note: helmet's own default HSTS header may
    // still be present (a separate, legacy-preserved helmet default) — that is not this
    // middleware's concern, only the redirect/403 enforcement is.
    const res = await fetch(`${base}/`, { redirect: "manual" });
    assert.equal(res.status, 200);
  });
});
