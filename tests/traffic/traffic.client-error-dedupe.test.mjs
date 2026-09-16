/**
 * Unit: server-side collapse of the same client failure reported twice.
 *
 * On 15/09/2026 the admin panel held 1685 api_failure rows for ~842 real failures: the axios
 * interceptor and the SPA collector's XHR patch each report the same HTTP error, with a
 * different `operation` (axios_post vs xhr_post). The client now shares a dedupe window, but
 * browsers still running a cached bundle do not — this is the server-side backstop.
 */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

const {
  CLIENT_ERROR_DEDUPE_MS,
  isDuplicateClientErrorReport,
  resetClientErrorDedupeForTests,
} = await import("../../server/modules/traffic/traffic.errors.ts");

const T0 = 1_760_000_000_000;

function report(overrides = {}) {
  return {
    category: "api_failure",
    message: "Erro ao obter estatísticas de indicações.",
    url: "https://blockminer.space/referrals",
    statusCode: 500,
    code: null,
    userId: 312,
    ip: "203.0.113.9",
    ...overrides,
  };
}

describe("isDuplicateClientErrorReport", () => {
  beforeEach(() => resetClientErrorDedupeForTests());

  it("collapses the axios/xhr pair into one stored row", () => {
    assert.equal(isDuplicateClientErrorReport(report(), T0), false);
    assert.equal(isDuplicateClientErrorReport(report(), T0 + 3), true);
  });

  it("accepts the same failure again once the window has passed", () => {
    assert.equal(isDuplicateClientErrorReport(report(), T0), false);
    assert.equal(isDuplicateClientErrorReport(report(), T0 + CLIENT_ERROR_DEDUPE_MS), false);
  });

  it("keeps different users apart (two people hitting the same bug both count)", () => {
    assert.equal(isDuplicateClientErrorReport(report({ userId: 1 }), T0), false);
    assert.equal(isDuplicateClientErrorReport(report({ userId: 2 }), T0), false);
  });

  it("keeps anonymous reporters apart by IP", () => {
    assert.equal(isDuplicateClientErrorReport(report({ userId: null, ip: "198.51.100.1" }), T0), false);
    assert.equal(isDuplicateClientErrorReport(report({ userId: null, ip: "198.51.100.2" }), T0), false);
    assert.equal(isDuplicateClientErrorReport(report({ userId: null, ip: "198.51.100.1" }), T0 + 1), true);
  });

  it("keeps distinct endpoints, statuses and codes apart", () => {
    assert.equal(isDuplicateClientErrorReport(report(), T0), false);
    assert.equal(isDuplicateClientErrorReport(report({ url: "https://blockminer.space/wallet" }), T0), false);
    assert.equal(isDuplicateClientErrorReport(report({ statusCode: 409 }), T0), false);
    assert.equal(isDuplicateClientErrorReport(report({ code: "WALLET_ALREADY_LINKED" }), T0), false);
  });

  it("keeps a crash and an api_failure with the same text apart", () => {
    assert.equal(isDuplicateClientErrorReport(report({ category: "crash" }), T0), false);
    assert.equal(isDuplicateClientErrorReport(report({ category: "api_failure" }), T0), false);
  });
});
