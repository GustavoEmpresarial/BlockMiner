import test from "node:test";
import assert from "node:assert/strict";

const {
  parseVpnapiResponse,
  lookupVpnapi,
} = await import("../../server/modules/ip-intelligence/ip-intelligence.vpnapi.ts");
const {
  vpnapiEnabled,
  vpnapiDailyLimit,
  vpnapiTimeoutMs,
  VPNAPI_FREE_DAILY_LIMIT,
  DEFAULT_PROVIDER_TIMEOUT_MS,
} = await import("../../server/modules/ip-intelligence/ip-intelligence.config.ts");
const { mergeProxyLookups } = await import("../../server/modules/ip-intelligence/ip-intelligence.providers.ts");

const DOCUMENTED_GOOGLE_DNS = {
  ip: "8.8.8.8",
  security: { vpn: false, proxy: false, tor: false, relay: false },
  location: { country: "United States", country_code: "US" },
  network: {
    network: "8.8.8.0/24",
    autonomous_system_number: "AS15169",
    autonomous_system_organization: "GOOGLE",
  },
};

test("vpnapiDailyLimit / timeout fall back to named provider defaults", () => {
  const savedLimit = process.env.VPNAPI_DAILY_LIMIT;
  const savedTimeout = process.env.VPNAPI_TIMEOUT_MS;
  delete process.env.VPNAPI_DAILY_LIMIT;
  delete process.env.VPNAPI_TIMEOUT_MS;
  try {
    assert.equal(vpnapiDailyLimit(), VPNAPI_FREE_DAILY_LIMIT);
    assert.equal(vpnapiTimeoutMs(), DEFAULT_PROVIDER_TIMEOUT_MS);
  } finally {
    savedLimit === undefined ? delete process.env.VPNAPI_DAILY_LIMIT : (process.env.VPNAPI_DAILY_LIMIT = savedLimit);
    savedTimeout === undefined ? delete process.env.VPNAPI_TIMEOUT_MS : (process.env.VPNAPI_TIMEOUT_MS = savedTimeout);
  }
});

test("vpnapiEnabled: false without key or flag", () => {
  const savedKey = process.env.VPNAPI_API_KEY;
  const savedEnabled = process.env.VPNAPI_ENABLED;
  delete process.env.VPNAPI_API_KEY;
  delete process.env.VPNAPI_ENABLED;
  try {
    assert.equal(vpnapiEnabled(), false);
  } finally {
    if (savedKey !== undefined) process.env.VPNAPI_API_KEY = savedKey;
    if (savedEnabled !== undefined) process.env.VPNAPI_ENABLED = savedEnabled;
  }
});

test("lookupVpnapi: no network when unconfigured", async () => {
  const savedKey = process.env.VPNAPI_API_KEY;
  const savedEnabled = process.env.VPNAPI_ENABLED;
  delete process.env.VPNAPI_API_KEY;
  delete process.env.VPNAPI_ENABLED;
  let fetchCalled = false;
  try {
    const result = await lookupVpnapi("8.8.8.8", {
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error("must not be called");
      },
    });
    assert.equal(fetchCalled, false);
    assert.equal(result.source, "vpnapi");
    assert.equal(result.error, "provider_not_configured");
  } finally {
    if (savedKey !== undefined) process.env.VPNAPI_API_KEY = savedKey;
    if (savedEnabled !== undefined) process.env.VPNAPI_ENABLED = savedEnabled;
  }
});

test("parseVpnapiResponse: documented 8.8.8.8 sample is clean", () => {
  const result = parseVpnapiResponse(DOCUMENTED_GOOGLE_DNS);
  assert.equal(result.source, "vpnapi");
  assert.equal(result.error, null);
  assert.equal(result.proxyDetected, false);
  assert.equal(result.proxyType, null);
  assert.equal(result.proxyProvider, "GOOGLE");
});

test("parseVpnapiResponse: vpn/tor/proxy/relay flags map to type priority", () => {
  const vpn = parseVpnapiResponse({ security: { vpn: true, proxy: false, tor: false, relay: false } });
  assert.equal(vpn.proxyDetected, true);
  assert.equal(vpn.proxyType, "vpn");
  const tor = parseVpnapiResponse({ security: { vpn: true, proxy: true, tor: true, relay: false } });
  assert.equal(tor.proxyType, "tor");
  const relay = parseVpnapiResponse({ security: { vpn: false, proxy: false, tor: false, relay: true } });
  assert.equal(relay.proxyType, "relay");
});

test("parseVpnapiResponse: message-only body is provider_error", () => {
  const result = parseVpnapiResponse({ message: "Invalid API key" });
  assert.equal(result.error, "provider_error");
});

test("mergeProxyLookups: single true among two answers is not enough (consensus); type prefers tor", () => {
  const lone = mergeProxyLookups([
    { source: "vpnapi", proxyDetected: false, proxyType: null, error: null },
    { source: "proxycheck_v2", proxyDetected: true, proxyType: "VPN", proxyRiskScore: 88, error: null },
  ]);
  assert.equal(lone.proxyDetected, false);

  const both = mergeProxyLookups([
    { source: "vpnapi", proxyDetected: true, proxyType: "vpn", error: null },
    { source: "proxycheck_v2", proxyDetected: true, proxyType: "VPN", proxyRiskScore: 88, error: null },
  ]);
  assert.equal(both.proxyDetected, true);
  assert.equal(both.proxyRiskScore, 88);
});

test("lookupVpnapi: parses mocked HTTP body without hitting the network", async () => {
  const savedKey = process.env.VPNAPI_API_KEY;
  const savedEnabled = process.env.VPNAPI_ENABLED;
  process.env.VPNAPI_API_KEY = "test-key";
  process.env.VPNAPI_ENABLED = "1";
  try {
    const result = await lookupVpnapi("8.8.8.8", {
      fetchImpl: async (url) => {
        assert.match(String(url), /vpnapi\.io\/api\/8\.8\.8\.8/);
        assert.match(String(url), /key=test-key/);
        return new Response(JSON.stringify(DOCUMENTED_GOOGLE_DNS), { status: 200 });
      },
    });
    assert.equal(result.error, null);
    assert.equal(result.proxyDetected, false);
    assert.equal(result.source, "vpnapi");
  } finally {
    savedKey === undefined ? delete process.env.VPNAPI_API_KEY : (process.env.VPNAPI_API_KEY = savedKey);
    savedEnabled === undefined ? delete process.env.VPNAPI_ENABLED : (process.env.VPNAPI_ENABLED = savedEnabled);
  }
});
