import test from "node:test";
import assert from "node:assert/strict";

const mod = await import("../../server/modules/ip-intelligence/ip-address.ts");

test("normalizeIp: IPv4 basic + with port", () => {
  assert.equal(mod.normalizeIp("192.168.1.1"), "192.168.1.1");
  assert.equal(mod.normalizeIp("10.0.0.5:8080"), "10.0.0.5");
});

test("normalizeIp: IPv6 basic, bracketed with port, ::ffff: mapped, zone id stripped", () => {
  assert.equal(mod.normalizeIp("::1"), "::1");
  assert.equal(mod.normalizeIp("[::1]:8080"), "::1");
  assert.equal(mod.normalizeIp("::ffff:127.0.0.1"), "127.0.0.1");
  assert.equal(mod.normalizeIp("fe80::1%eth0"), "fe80::1");
});

test("normalizeIp: invalid input returns null", () => {
  assert.equal(mod.normalizeIp(""), null);
  assert.equal(mod.normalizeIp(null), null);
  assert.equal(mod.normalizeIp(undefined), null);
  assert.equal(mod.normalizeIp("not-an-ip"), null);
  assert.equal(mod.normalizeIp("999.999.999.999"), null);
});

test("isIpInCidr: IPv4 matches within range", () => {
  assert.equal(mod.isIpInCidr("10.1.2.3", "10.0.0.0/8"), true);
  assert.equal(mod.isIpInCidr("192.168.1.5", "192.168.0.0/16"), true);
  assert.equal(mod.isIpInCidr("192.168.1.5", "192.168.1.5/32"), true);
});

test("isIpInCidr: IPv4 rejects outside range", () => {
  assert.equal(mod.isIpInCidr("11.0.0.1", "10.0.0.0/8"), false);
  assert.equal(mod.isIpInCidr("172.32.0.1", "172.16.0.0/12"), false);
});

test("isIpInCidr: IPv6 matches within range", () => {
  assert.equal(mod.isIpInCidr("::1", "::1/128"), true);
  assert.equal(mod.isIpInCidr("fe80::1", "fe80::/10"), true);
});

test("isIpInCidr: version mismatch (v4 ip vs v6 cidr) always false", () => {
  assert.equal(mod.isIpInCidr("10.0.0.1", "::1/128"), false);
  assert.equal(mod.isIpInCidr("::1", "10.0.0.0/8"), false);
});

test("isIpInCidr: malformed cidr / invalid bits returns false, never throws", () => {
  assert.equal(mod.isIpInCidr("10.0.0.1", "10.0.0.0/33"), false);
  assert.equal(mod.isIpInCidr("10.0.0.1", "10.0.0.0/-1"), false);
  assert.equal(mod.isIpInCidr("10.0.0.1", "not-a-cidr"), false);
  assert.equal(mod.isIpInCidr("garbage", "10.0.0.0/8"), false);
});

test("isInfrastructureIp: loopback + private ranges", () => {
  assert.equal(mod.isInfrastructureIp("127.0.0.1"), true);
  assert.equal(mod.isInfrastructureIp("::1"), true);
  assert.equal(mod.isInfrastructureIp("10.1.1.1"), true);
  assert.equal(mod.isInfrastructureIp("172.16.5.5"), true);
  assert.equal(mod.isInfrastructureIp("192.168.1.1"), true);
  assert.equal(mod.isInfrastructureIp("169.254.1.1"), true);
});

test("isInfrastructureIp: public IP is not infrastructure", () => {
  assert.equal(mod.isInfrastructureIp("8.8.8.8"), false);
  assert.equal(mod.isInfrastructureIp("1.1.1.1"), false);
});

test("deriveDefaultNetworkCidr: derives /64 for public IPv6, null for IPv4/infra", () => {
  assert.equal(mod.deriveDefaultNetworkCidr("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(mod.deriveDefaultNetworkCidr("8.8.8.8"), null);
  assert.equal(mod.deriveDefaultNetworkCidr("::1"), null);
});

test("resolveClientIp: no trust-proxy env falls back to socket remoteAddress", () => {
  delete process.env.TRUST_PROXY;
  const req = {
    headers: { "x-forwarded-for": "8.8.8.8" },
    socket: { remoteAddress: "203.0.113.9" },
  };
  const resolved = mod.resolveClientIp(req);
  assert.equal(resolved.ip, "203.0.113.9");
  assert.equal(resolved.source, "socket");
  assert.equal(resolved.headersTrusted, false);
});

test("resolveClientIp: TRUST_PROXY=1 with trusted remote honors x-forwarded-for", () => {
  process.env.TRUST_PROXY = "1";
  try {
    const req = {
      headers: { "x-forwarded-for": "8.8.8.8, 10.0.0.1" },
      socket: { remoteAddress: "127.0.0.1" },
    };
    const resolved = mod.resolveClientIp(req);
    assert.equal(resolved.ip, "8.8.8.8");
    assert.equal(resolved.source, "x-forwarded-for");
    assert.equal(resolved.headersTrusted, true);
  } finally {
    delete process.env.TRUST_PROXY;
  }
});
