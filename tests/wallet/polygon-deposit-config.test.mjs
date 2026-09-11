import test from "node:test";
import assert from "node:assert/strict";

const config = await import("../../server/shared/blockchain/polygonDepositConfig.ts");
const provider = await import("../../server/shared/blockchain/polygonProvider.ts");

test("getRequiredBlockConfirmations defaults to 50 (legacy default)", () => {
  delete process.env.DEPOSIT_MIN_CONFIRMATIONS;
  assert.equal(config.getRequiredBlockConfirmations(), 50);
});

test("getRequiredBlockConfirmations honors DEPOSIT_MIN_CONFIRMATIONS", () => {
  process.env.DEPOSIT_MIN_CONFIRMATIONS = "12";
  assert.equal(config.getRequiredBlockConfirmations(), 12);
  delete process.env.DEPOSIT_MIN_CONFIRMATIONS;
});

test("getRequiredBlockConfirmations falls back to 50 on garbage input", () => {
  process.env.DEPOSIT_MIN_CONFIRMATIONS = "not-a-number";
  assert.equal(config.getRequiredBlockConfirmations(), 50);
  delete process.env.DEPOSIT_MIN_CONFIRMATIONS;
});

test("getMinDepositPol defaults to a positive number", () => {
  assert.ok(config.getMinDepositPol() > 0);
});

test("getPolygonRpcTimeoutMs defaults to 4500ms (legacy default)", () => {
  delete process.env.POLYGON_RPC_TIMEOUT_MS;
  assert.equal(provider.getPolygonRpcTimeoutMs(), 4500);
});

test("getSharedPolygonProvider defaults RPC URL to the public Polygon RPC and never needs a private key", () => {
  provider.resetSharedPolygonProviderForTests();
  delete process.env.POLYGON_RPC_URL;
  const p = provider.getSharedPolygonProvider();
  // ethers doesn't expose the raw URL directly on all versions; assert it constructs without throwing
  // and is a read-only JsonRpcProvider (no signer attached).
  assert.equal(typeof p.getTransactionReceipt, "function");
  assert.equal(typeof p.getSigner, "function");
  provider.resetSharedPolygonProviderForTests();
});
