import test from "node:test";
import assert from "node:assert/strict";

const { evaluateAnonymousIp } = await import("../../server/modules/ip-intelligence/ip-intelligence.policy.ts");
const { CLOUDFLARE_WARP_ASN } = await import("../../server/modules/ip-intelligence/ip-intelligence.config.ts");
const { parseVpnapiResponse } = await import("../../server/modules/ip-intelligence/ip-intelligence.vpnapi.ts");

test("evaluateAnonymousIp: clean residential is open", () => {
  const v = evaluateAnonymousIp({
    proxyDetected: false,
    proxyType: null,
    providerType: "residential",
    asn: 7738,
    asnOrg: "TIM S A",
    proxyProvider: null,
    reverseDns: null,
    providerLabel: "Residential ISP",
  });
  assert.equal(v.blocked, false);
});

test("evaluateAnonymousIp: hosting AWS is not treated as VPN", () => {
  const v = evaluateAnonymousIp({
    proxyDetected: false,
    proxyType: null,
    providerType: "hosting",
    asn: 16509,
    asnOrg: "Amazon.com",
    proxyProvider: null,
    reverseDns: null,
    providerLabel: "Datacenter/hosting",
  });
  assert.equal(v.blocked, false);
});

test("evaluateAnonymousIp: provider proxyDetected blocks", () => {
  const v = evaluateAnonymousIp({ proxyDetected: true, proxyType: "vpn", providerType: "unknown" });
  assert.equal(v.blocked, true);
  assert.equal(v.reason, "provider:vpn");
});

test("evaluateAnonymousIp: Cloudflare WARP ASN blocks", () => {
  const v = evaluateAnonymousIp({
    proxyDetected: false,
    proxyType: null,
    providerType: "hosting",
    asn: CLOUDFLARE_WARP_ASN,
    asnOrg: "CLOUDFLARENET",
    proxyProvider: null,
    reverseDns: null,
    providerLabel: null,
  });
  assert.equal(v.blocked, true);
  assert.equal(v.reason, `asn:${CLOUDFLARE_WARP_ASN}`);
});

test("evaluateAnonymousIp: bare Cloudflare org does not block (CDN FP); WARP name does", () => {
  const cdn = evaluateAnonymousIp({
    proxyDetected: false,
    proxyType: null,
    providerType: "unknown",
    asn: null,
    asnOrg: "Cloudflare, Inc.",
    proxyProvider: "CLOUDFLARENET",
    reverseDns: null,
    providerLabel: null,
  });
  assert.equal(cdn.blocked, false);

  const warp = evaluateAnonymousIp({
    proxyDetected: false,
    proxyType: null,
    providerType: "unknown",
    asn: null,
    asnOrg: "Cloudflare WARP",
    proxyProvider: null,
    reverseDns: null,
    providerLabel: null,
  });
  assert.equal(warp.blocked, true);
  assert.equal(warp.reason, "org:cloudflare_warp");
});

test("evaluateAnonymousIp: null input is open (honest degrade)", () => {
  assert.equal(evaluateAnonymousIp(null).blocked, false);
});

test("parseVpnapiResponse: copies ASN so WARP can be classified", () => {
  const result = parseVpnapiResponse({
    security: { vpn: false, proxy: false, tor: false, relay: false },
    network: {
      autonomous_system_number: "AS13335",
      autonomous_system_organization: "CLOUDFLARENET",
    },
  });
  assert.equal(result.asn, 13335);
  assert.equal(result.asnOrg, "CLOUDFLARENET");
  assert.equal(result.proxyDetected, false);
  const v = evaluateAnonymousIp({
    proxyDetected: result.proxyDetected ?? null,
    proxyType: result.proxyType ?? null,
    providerType: "unknown",
    asn: result.asn ?? null,
    asnOrg: result.asnOrg ?? null,
    proxyProvider: result.proxyProvider ?? null,
    reverseDns: null,
    providerLabel: null,
  });
  assert.equal(v.blocked, true);
});
