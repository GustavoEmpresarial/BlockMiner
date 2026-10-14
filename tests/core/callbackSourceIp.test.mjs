import test from "node:test";
import assert from "node:assert/strict";

const { getCallbackSourceIp } = await import("../../server/modules/ip-intelligence/ip-address.ts");

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

const proxyEnv = { TRUST_PROXY: "true", TRUSTED_PROXY_CIDRS: undefined };

test("CF-Connecting-IP is used when the request came through the trusted proxy hop", () => {
  withEnv(proxyEnv, () => {
    const req = { headers: { "cf-connecting-ip": "95.216.65.163" }, socket: { remoteAddress: "172.18.0.5" } };
    assert.equal(getCallbackSourceIp(req), "95.216.65.163");
  });
});

test("forged CF-Connecting-IP straight from the internet is ignored", () => {
  withEnv(proxyEnv, () => {
    const req = { headers: { "cf-connecting-ip": "95.216.65.163" }, socket: { remoteAddress: "203.0.113.9" } };
    assert.equal(getCallbackSourceIp(req), "203.0.113.9");
  });
});

test("without TRUST_PROXY no forwarded header is trusted", () => {
  withEnv({ TRUST_PROXY: undefined }, () => {
    const req = {
      headers: { "cf-connecting-ip": "95.216.65.163", "x-real-ip": "95.216.65.163" },
      socket: { remoteAddress: "172.18.0.5" },
    };
    assert.equal(getCallbackSourceIp(req), "172.18.0.5");
  });
});

test("infrastructure value in CF-Connecting-IP falls back to the proxy's real-ip headers", () => {
  withEnv(proxyEnv, () => {
    const req = {
      headers: { "cf-connecting-ip": "127.0.0.1", "x-real-ip": "148.72.132.180" },
      socket: { remoteAddress: "172.18.0.5" },
    };
    assert.equal(getCallbackSourceIp(req), "148.72.132.180");
  });
});
