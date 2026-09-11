import test from "node:test";
import assert from "node:assert/strict";

const svc = await import("../../server/modules/ip-intelligence/ip-intelligence.service.ts");

test("proxycheckEnabled: false when no PROXYCHECK_API_KEY is set (default dev env)", () => {
  const savedKey = process.env.PROXYCHECK_API_KEY;
  const savedEnabled = process.env.PROXYCHECK_ENABLED;
  delete process.env.PROXYCHECK_API_KEY;
  delete process.env.PROXYCHECK_ENABLED;
  try {
    assert.equal(svc.proxycheckEnabled(), false);
  } finally {
    if (savedKey !== undefined) process.env.PROXYCHECK_API_KEY = savedKey;
    if (savedEnabled !== undefined) process.env.PROXYCHECK_ENABLED = savedEnabled;
  }
});

test("proxycheckEnabled: false when key set but PROXYCHECK_ENABLED is off", () => {
  const savedKey = process.env.PROXYCHECK_API_KEY;
  const savedEnabled = process.env.PROXYCHECK_ENABLED;
  process.env.PROXYCHECK_API_KEY = "fake-test-key";
  process.env.PROXYCHECK_ENABLED = "0";
  try {
    assert.equal(svc.proxycheckEnabled(), false);
  } finally {
    savedKey === undefined ? delete process.env.PROXYCHECK_API_KEY : (process.env.PROXYCHECK_API_KEY = savedKey);
    savedEnabled === undefined ? delete process.env.PROXYCHECK_ENABLED : (process.env.PROXYCHECK_ENABLED = savedEnabled);
  }
});

test("lookupProxycheck: degrades gracefully (provider_not_configured) with NO network call when disabled", async () => {
  const savedKey = process.env.PROXYCHECK_API_KEY;
  const savedEnabled = process.env.PROXYCHECK_ENABLED;
  delete process.env.PROXYCHECK_API_KEY;
  delete process.env.PROXYCHECK_ENABLED;
  let fetchCalled = false;
  try {
    const result = await svc.lookupProxycheck("8.8.8.8", {
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error("must not be called");
      },
    });
    assert.equal(fetchCalled, false, "no real HTTP call should be attempted without a configured key");
    assert.equal(result.source, "proxycheck_v2");
    assert.equal(result.error, "provider_not_configured");
    assert.equal(result.proxyDetected, undefined);
  } finally {
    if (savedKey !== undefined) process.env.PROXYCHECK_API_KEY = savedKey;
    if (savedEnabled !== undefined) process.env.PROXYCHECK_ENABLED = savedEnabled;
  }
});

test("lookupAsn: local-heuristic only (no external call) when IP_ASN_PROVIDER unset", async () => {
  const saved = process.env.IP_ASN_PROVIDER;
  delete process.env.IP_ASN_PROVIDER;
  let fetchCalled = false;
  try {
    const result = await svc.lookupAsn("8.8.8.8", {
      fetchImpl: async () => {
        fetchCalled = true;
        throw new Error("must not be called");
      },
    });
    assert.equal(fetchCalled, false);
    assert.equal(result.source, "local-heuristic");
  } finally {
    if (saved !== undefined) process.env.IP_ASN_PROVIDER = saved;
  }
});

test("getCachedIpIntelligence: infrastructure IP short-circuits without touching prisma/network", async () => {
  const result = await svc.getCachedIpIntelligence(null, "127.0.0.1");
  assert.equal(result.providerType, "infrastructure");
  assert.equal(result.confidence, "high");
});

test("getCachedIpIntelligence: invalid IP returns null, never throws", async () => {
  const result = await svc.getCachedIpIntelligence(null, "not-an-ip");
  assert.equal(result, null);
});

test("getCachedIpIntelligence: public IP with no prisma client and no external providers degrades to unknown/local-heuristic", async () => {
  const savedKey = process.env.PROXYCHECK_API_KEY;
  const savedEnabled = process.env.PROXYCHECK_ENABLED;
  const savedVpnKey = process.env.VPNAPI_API_KEY;
  const savedVpnEnabled = process.env.VPNAPI_ENABLED;
  const savedAsn = process.env.IP_ASN_PROVIDER;
  delete process.env.PROXYCHECK_API_KEY;
  delete process.env.PROXYCHECK_ENABLED;
  delete process.env.VPNAPI_API_KEY;
  delete process.env.VPNAPI_ENABLED;
  delete process.env.IP_ASN_PROVIDER;
  try {
    const result = await svc.getCachedIpIntelligence(null, "8.8.8.8");
    assert.equal(result.source, "local-heuristic");
    assert.equal(result.proxyDetected, null);
    assert.equal(result.error, null);
  } finally {
    if (savedKey !== undefined) process.env.PROXYCHECK_API_KEY = savedKey;
    if (savedEnabled !== undefined) process.env.PROXYCHECK_ENABLED = savedEnabled;
    if (savedVpnKey !== undefined) process.env.VPNAPI_API_KEY = savedVpnKey;
    if (savedVpnEnabled !== undefined) process.env.VPNAPI_ENABLED = savedVpnEnabled;
    if (savedAsn !== undefined) process.env.IP_ASN_PROVIDER = savedAsn;
  }
});
