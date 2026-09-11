import test from "node:test";
import assert from "node:assert/strict";

const { parseGetipintelResponse, lookupGetipintel } = await import(
  "../../server/modules/ip-intelligence/ip-intelligence.getipintel.ts"
);
const { parseIplogsResponse, lookupIplogs } = await import(
  "../../server/modules/ip-intelligence/ip-intelligence.iplogs.ts"
);
const { parseIpapiisResponse } = await import("../../server/modules/ip-intelligence/ip-intelligence.ipapiis.ts");
const { parseIphubResponse } = await import("../../server/modules/ip-intelligence/ip-intelligence.iphub.ts");
const { parseIpqsResponse } = await import("../../server/modules/ip-intelligence/ip-intelligence.ipqs.ts");
const { parseVpnblockerResponse, lookupVpnblocker } = await import(
  "../../server/modules/ip-intelligence/ip-intelligence.vpnblocker.ts"
);
const { parseAbstractapiResponse } = await import(
  "../../server/modules/ip-intelligence/ip-intelligence.abstractapi.ts"
);
const { PROXY_PROVIDERS, mergeProxyLookups } = await import(
  "../../server/modules/ip-intelligence/ip-intelligence.providers.ts"
);
const {
  GETIPINTEL_FREE_DAILY_LIMIT,
  IPLOGS_DEFAULT_DAILY_LIMIT,
  VPNBLOCKER_DEFAULT_DAILY_LIMIT,
  IPQS_DEFAULT_DAILY_LIMIT,
  ABSTRACTAPI_DEFAULT_DAILY_LIMIT,
} = await import("../../server/modules/ip-intelligence/ip-intelligence.config.ts");

test("PROXY_PROVIDERS registers exactly 9 anti-proxy sources", () => {
  assert.equal(PROXY_PROVIDERS.length, 9);
  const ids = PROXY_PROVIDERS.map((p) => p.id).sort();
  assert.deepEqual(ids, [
    "abstractapi",
    "getipintel",
    "ipapiis",
    "iphub",
    "iplogs",
    "ipqs",
    "proxycheck_v2",
    "vpnapi",
    "vpnblocker",
  ]);
});

test("named free-tier daily defaults match provider docs", () => {
  assert.equal(GETIPINTEL_FREE_DAILY_LIMIT, 500);
  assert.equal(IPLOGS_DEFAULT_DAILY_LIMIT, 2000);
  assert.equal(VPNBLOCKER_DEFAULT_DAILY_LIMIT, Math.floor(500 / 31));
  assert.equal(IPQS_DEFAULT_DAILY_LIMIT, Math.floor(1000 / 31));
  assert.equal(ABSTRACTAPI_DEFAULT_DAILY_LIMIT, Math.floor(1000 / 31));
});

test("parseGetipintelResponse: flags=m hit (result 1) blocks", () => {
  const hit = parseGetipintelResponse(
    { status: "success", result: "1", queryIP: "1.1.1.1" },
    1,
  );
  assert.equal(hit.proxyDetected, true);
  assert.equal(hit.proxyType, "proxy");
  const clean = parseGetipintelResponse({ status: "success", result: "0" }, 1);
  assert.equal(clean.proxyDetected, false);
});

test("lookupGetipintel: no network when unconfigured", async () => {
  const savedEnabled = process.env.GETIPINTEL_ENABLED;
  const savedEmail = process.env.GETIPINTEL_CONTACT_EMAIL;
  delete process.env.GETIPINTEL_ENABLED;
  delete process.env.GETIPINTEL_CONTACT_EMAIL;
  let called = false;
  try {
    const r = await lookupGetipintel("8.8.8.8", {
      fetchImpl: async () => {
        called = true;
        throw new Error("no");
      },
    });
    assert.equal(called, false);
    assert.equal(r.error, "provider_not_configured");
  } finally {
    savedEnabled === undefined ? delete process.env.GETIPINTEL_ENABLED : (process.env.GETIPINTEL_ENABLED = savedEnabled);
    savedEmail === undefined
      ? delete process.env.GETIPINTEL_CONTACT_EMAIL
      : (process.env.GETIPINTEL_CONTACT_EMAIL = savedEmail);
  }
});

test("parseIplogsResponse: warp sample is vpn", () => {
  const r = parseIplogsResponse({
    score: 0.85,
    verdict: "vpn_detected",
    is_vpn: true,
    ip_info: { asn: "AS13335", org: "Cloudflare WARP", is_vpn: true, is_proxy: true, vpn_provider: "Cloudflare WARP" },
  });
  assert.equal(r.proxyDetected, true);
  assert.equal(r.proxyType, "vpn");
  assert.equal(r.asn, 13335);
});

test("parseIplogsResponse: clean sample", () => {
  const r = parseIplogsResponse({
    score: 0,
    verdict: "clean",
    is_vpn: false,
    ip_info: { asn: "AS13335", org: "Cloudflare, Inc.", is_vpn: false, is_proxy: false },
  });
  assert.equal(r.proxyDetected, false);
});

test("lookupIplogs: no network when disabled", async () => {
  const saved = process.env.IPLOGS_ENABLED;
  process.env.IPLOGS_ENABLED = "false";
  let called = false;
  try {
    const r = await lookupIplogs("1.1.1.1", {
      fetchImpl: async () => {
        called = true;
        throw new Error("no");
      },
    });
    assert.equal(called, false);
    assert.equal(r.error, "provider_not_configured");
  } finally {
    saved === undefined ? delete process.env.IPLOGS_ENABLED : (process.env.IPLOGS_ENABLED = saved);
  }
});

test("parseIpapiisResponse: keyed flags", () => {
  const r = parseIpapiisResponse({
    is_vpn: true,
    is_proxy: false,
    is_tor: false,
    asn_num: 12345,
    asn_org: "Example VPN",
  });
  assert.equal(r.proxyDetected, true);
  assert.equal(r.proxyType, "vpn");
  const anon = parseIpapiisResponse({ ip: "1.1.1.1", company: "x", asn: "AS1" });
  assert.equal(anon.error, "provider_error");
});

test("parseIphubResponse: block tiers", () => {
  assert.equal(parseIphubResponse({ block: 0, isp: "ISP", asn: 1 }).proxyDetected, false);
  assert.equal(parseIphubResponse({ block: 1, isp: "VPN", asn: 2 }).proxyDetected, true);
  assert.equal(parseIphubResponse({ block: 2, isp: "Mixed", asn: 3 }).proxyDetected, true);
});

test("parseIpqsResponse: vpn/tor/proxy", () => {
  const r = parseIpqsResponse({
    success: true,
    proxy: true,
    vpn: true,
    tor: false,
    fraud_score: 88,
    ISP: "Evil VPN",
    ASN: 999,
  });
  assert.equal(r.proxyDetected, true);
  assert.equal(r.proxyType, "vpn");
  assert.equal(r.proxyRiskScore, 88);
});

test("parseVpnblockerResponse: host-ip alone (CDN/hosting) is not proxy; VPN org is", () => {
  const hosting = parseVpnblockerResponse({
    status: "success",
    "host-ip": true,
    org: "Cloudflare, Inc.",
  });
  assert.equal(hosting.proxyDetected, false);
  assert.equal(hosting.proxyType, null);

  const vpn = parseVpnblockerResponse({
    status: "success",
    "host-ip": true,
    org: "NordVPN Hosting",
  });
  assert.equal(vpn.proxyDetected, true);
  assert.equal(vpn.proxyType, "vpn");

  const clean = parseVpnblockerResponse({ status: "success", "host-ip": false, org: "Home ISP" });
  assert.equal(clean.proxyDetected, false);
});

test("lookupVpnblocker: no network when disabled", async () => {
  const saved = process.env.VPNBLOCKER_ENABLED;
  process.env.VPNBLOCKER_ENABLED = "0";
  let called = false;
  try {
    const r = await lookupVpnblocker("1.1.1.1", {
      fetchImpl: async () => {
        called = true;
        throw new Error("no");
      },
    });
    assert.equal(called, false);
    assert.equal(r.error, "provider_not_configured");
  } finally {
    saved === undefined ? delete process.env.VPNBLOCKER_ENABLED : (process.env.VPNBLOCKER_ENABLED = saved);
  }
});

test("parseAbstractapiResponse: security flags", () => {
  const r = parseAbstractapiResponse({
    ip_address: "1.2.3.4",
    security: { is_vpn: false, is_proxy: false, is_tor: true, is_relay: false },
    connection: { asn: 1, organization_name: "Tor Exit" },
  });
  assert.equal(r.proxyDetected, true);
  assert.equal(r.proxyType, "tor");
});

test("mergeProxyLookups: tor always wins; otherwise needs consensus when 2+ answered", () => {
  const withTor = mergeProxyLookups([
    { source: "iplogs", proxyDetected: false, error: null },
    { source: "vpnblocker", proxyDetected: true, proxyType: "proxy", error: null },
    { source: "getipintel", proxyDetected: true, proxyType: "tor", error: null },
  ]);
  assert.equal(withTor.proxyDetected, true);
  assert.equal(withTor.proxyType, "tor");

  const loneVp = mergeProxyLookups([
    { source: "iplogs", proxyDetected: false, error: null },
    { source: "vpnblocker", proxyDetected: true, proxyType: "proxy", error: null },
  ]);
  assert.equal(loneVp.proxyDetected, false);
  assert.equal(loneVp.proxyType, null);

  const twoVpn = mergeProxyLookups([
    { source: "proxycheck_v2", proxyDetected: true, proxyType: "vpn", error: null },
    { source: "vpnapi", proxyDetected: true, proxyType: "vpn", error: null },
  ]);
  assert.equal(twoVpn.proxyDetected, true);
  assert.equal(twoVpn.proxyType, "vpn");
});
