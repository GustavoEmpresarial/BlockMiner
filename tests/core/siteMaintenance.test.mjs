import test from "node:test";
import assert from "node:assert/strict";

const {
  siteMaintenanceEnabled,
  siteMaintenanceBypassHosts,
  resolveRequestHost,
  isMaintenanceBypassHost,
  isPathAllowedDuringMaintenance,
  wantsMaintenanceHtml,
  createSiteMaintenanceMiddleware,
} = await import("../../server/core/http/middleware/siteMaintenance.ts");

test("siteMaintenanceEnabled reads common truthy flags", () => {
  assert.equal(siteMaintenanceEnabled({ SITE_MAINTENANCE: "1" }), true);
  assert.equal(siteMaintenanceEnabled({ SITE_MAINTENANCE: "true" }), true);
  assert.equal(siteMaintenanceEnabled({ SITE_MAINTENANCE: "on" }), true);
  assert.equal(siteMaintenanceEnabled({ SITE_MAINTENANCE: "0" }), false);
  assert.equal(siteMaintenanceEnabled({}), false);
});

test("siteMaintenanceBypassHosts parses comma/space lists", () => {
  const hosts = siteMaintenanceBypassHosts({
    SITE_MAINTENANCE_BYPASS_HOSTS: "dev.blockminer.space, staging.example.com.",
  });
  assert.equal(hosts.has("dev.blockminer.space"), true);
  assert.equal(hosts.has("staging.example.com"), true);
  assert.equal(hosts.has("blockminer.space"), false);
});

test("resolveRequestHost prefers x-forwarded-host and strips port", () => {
  assert.equal(
    resolveRequestHost({
      "x-forwarded-host": "dev.blockminer.space, proxy.internal",
      host: "blockminer.space:443",
    }),
    "dev.blockminer.space",
  );
  assert.equal(resolveRequestHost({ host: "BlockMiner.space:5102" }), "blockminer.space");
});

test("isPathAllowedDuringMaintenance allowlist", () => {
  assert.equal(isPathAllowedDuringMaintenance("/health"), true);
  assert.equal(isPathAllowedDuringMaintenance("/api/health"), true);
  assert.equal(isPathAllowedDuringMaintenance("/admin"), true);
  assert.equal(isPathAllowedDuringMaintenance("/admin/errors"), true);
  assert.equal(isPathAllowedDuringMaintenance("/api/admin/client-errors"), true);
  assert.equal(isPathAllowedDuringMaintenance("/assets/app.js"), true);
  assert.equal(isPathAllowedDuringMaintenance("/media/fans/cooling-fan-system.svg"), true);
  assert.equal(isPathAllowedDuringMaintenance("/media"), true);
  assert.equal(isPathAllowedDuringMaintenance("/games/cartrush/truck.png"), true);
  assert.equal(isPathAllowedDuringMaintenance("/games/memory"), false);
  assert.equal(isPathAllowedDuringMaintenance("/favicon.ico"), true);
  assert.equal(isPathAllowedDuringMaintenance("/api/auth/google/callback"), true);
  assert.equal(isPathAllowedDuringMaintenance("/api/auth/satspay/callback"), true);
  assert.equal(isPathAllowedDuringMaintenance("/api/auth/google/config"), true);
  assert.equal(isPathAllowedDuringMaintenance("/api/auth/satspay/config"), true);
  assert.equal(isPathAllowedDuringMaintenance("/api/auth/google"), true);
  assert.equal(isPathAllowedDuringMaintenance("/api/auth/satspay"), true);
  assert.equal(isPathAllowedDuringMaintenance("/login"), true);
  assert.equal(isPathAllowedDuringMaintenance("/register"), true);
  assert.equal(isPathAllowedDuringMaintenance("/"), false);
  assert.equal(isPathAllowedDuringMaintenance("/api/faucet/start"), false);
});

test("wantsMaintenanceHtml prefers Accept and skips API paths", () => {
  assert.equal(wantsMaintenanceHtml({ method: "GET", path: "/", accept: "text/html" }), true);
  assert.equal(wantsMaintenanceHtml({ method: "GET", path: "/dashboard" }), true);
  assert.equal(wantsMaintenanceHtml({ method: "GET", path: "/api/track/hit", accept: "*/*" }), false);
  assert.equal(wantsMaintenanceHtml({ method: "POST", path: "/login" }), false);
});

function fakeReqRes({ method = "GET", path = "/", headers = {} } = {}) {
  const req = { method, path, headers };
  let statusCode = null;
  let jsonBody = null;
  let htmlBody = null;
  let contentType = null;
  const headersOut = {};
  const res = {
    setHeader(k, v) {
      headersOut[k] = v;
      return this;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    type(t) {
      contentType = t;
      return this;
    },
    send(body) {
      htmlBody = body;
      return this;
    },
    json(body) {
      jsonBody = body;
      return this;
    },
  };
  return {
    req,
    res,
    getStatus: () => statusCode,
    getJson: () => jsonBody,
    getHtml: () => htmlBody,
    getType: () => contentType,
    getHeaders: () => headersOut,
  };
}

test("middleware is noop when maintenance disabled", () => {
  const mw = createSiteMaintenanceMiddleware({ SITE_MAINTENANCE: "0" });
  const { req, res } = fakeReqRes({ path: "/" });
  let next = false;
  mw(req, res, () => {
    next = true;
  });
  assert.equal(next, true);
});

test("middleware bypasses allowlisted host even when maintenance is on", () => {
  const mw = createSiteMaintenanceMiddleware({
    SITE_MAINTENANCE: "1",
    SITE_MAINTENANCE_BYPASS_HOSTS: "dev.blockminer.space",
  });
  const { req, res, getStatus } = fakeReqRes({
    path: "/",
    headers: { host: "dev.blockminer.space" },
  });
  let next = false;
  mw(req, res, () => {
    next = true;
  });
  assert.equal(next, true);
  assert.equal(getStatus(), null);
  assert.equal(isMaintenanceBypassHost("dev.blockminer.space", {
    SITE_MAINTENANCE_BYPASS_HOSTS: "dev.blockminer.space",
  }), true);
});

test("middleware allows /health and /admin during maintenance", () => {
  const mw = createSiteMaintenanceMiddleware({ SITE_MAINTENANCE: "1" });
  for (const path of ["/health", "/admin", "/api/admin/x", "/assets/x.js"]) {
    const { req, res } = fakeReqRes({ path, headers: { host: "blockminer.space" } });
    let next = false;
    mw(req, res, () => {
      next = true;
    });
    assert.equal(next, true, path);
  }
});

test("middleware returns JSON 503 for API clients", () => {
  const mw = createSiteMaintenanceMiddleware({ SITE_MAINTENANCE: "1" });
  const { req, res, getStatus, getJson, getHeaders } = fakeReqRes({
    method: "GET",
    path: "/api/faucet/status",
    headers: { host: "blockminer.space", accept: "application/json" },
  });
  let next = false;
  mw(req, res, () => {
    next = true;
  });
  assert.equal(next, false);
  assert.equal(getStatus(), 503);
  assert.equal(getJson().code, "SITE_MAINTENANCE");
  assert.match(getJson().message, /manuten/i);
  assert.equal(getHeaders()["Retry-After"], "3600");
});

test("middleware returns HTML 503 for browser navigations", () => {
  const mw = createSiteMaintenanceMiddleware({ SITE_MAINTENANCE: "1" });
  const { req, res, getStatus, getHtml, getType } = fakeReqRes({
    method: "GET",
    path: "/",
    headers: { host: "blockminer.space", accept: "text/html" },
  });
  mw(req, res, () => {
    assert.fail("should not next");
  });
  assert.equal(getStatus(), 503);
  assert.equal(getType(), "html");
  assert.match(String(getHtml()), /BlockMiner/);
  assert.match(String(getHtml()), /manuten/i);
});
