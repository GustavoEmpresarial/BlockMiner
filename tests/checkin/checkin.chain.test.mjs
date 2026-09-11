import test from "node:test";
import assert from "node:assert/strict";

const {
  normalizeAddr,
  isValidTxHashFormat,
  assertValidTxHash,
  assertValidWalletAddress,
  getExpectedCheckinChainId,
  resolveCheckinContractAddress,
  resolveCheckinReceiverFromEnv,
  hasCheckinTreasury,
  parseOptionalChainIdFromBody,
  evaluateCheckinPayment,
} = await import("../../server/modules/checkin/checkin.chain.ts");

test("normalizeAddr — lowercases and trims", () => {
  assert.equal(normalizeAddr("  0xABC123  "), "0xabc123");
  assert.equal(normalizeAddr(null), "");
  assert.equal(normalizeAddr(undefined), "");
});

test("isValidTxHashFormat — valid 66-char hex", () => {
  const valid = "0x" + "a".repeat(64);
  assert.equal(isValidTxHashFormat(valid), true);
  assert.equal(isValidTxHashFormat("0x1234"), false);
  assert.equal(isValidTxHashFormat("not-a-hash"), false);
});

test("assertValidTxHash — throws INVALID_TX_HASH on bad input", () => {
  assert.throws(() => assertValidTxHash("bad"), /Invalid transaction hash/);
  try {
    assertValidTxHash("bad");
    assert.fail("should have thrown");
  } catch (err) {
    assert.equal(err.code, "INVALID_TX_HASH");
  }
});

test("assertValidWalletAddress — accepts 40-hex, rejects otherwise", () => {
  const valid = "0x" + "1".repeat(40);
  assert.equal(assertValidWalletAddress(valid), valid);
  assert.throws(() => assertValidWalletAddress("0xshort"), /Invalid wallet address/);
});

test("getExpectedCheckinChainId — defaults to Polygon 137", () => {
  assert.equal(getExpectedCheckinChainId({}), 137);
  assert.equal(getExpectedCheckinChainId({ CHECKIN_CHAIN_ID: "80001" }), 80001);
});

test("resolveCheckinContractAddress — empty when unset or zero address", () => {
  assert.equal(resolveCheckinContractAddress({}), "");
  assert.equal(
    resolveCheckinContractAddress({ CHECKIN_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000" }),
    "",
  );
  const addr = "0x" + "9".repeat(40);
  assert.equal(resolveCheckinContractAddress({ CHECKIN_CONTRACT_ADDRESS: addr }), addr);
});

test("resolveCheckinReceiverFromEnv — CHECKIN_RECEIVER wins over DEPOSIT_WALLET_ADDRESS", () => {
  const a = "0x" + "1".repeat(40);
  const b = "0x" + "2".repeat(40);
  assert.equal(resolveCheckinReceiverFromEnv({ CHECKIN_RECEIVER: a, DEPOSIT_WALLET_ADDRESS: b }), a);
  assert.equal(resolveCheckinReceiverFromEnv({ DEPOSIT_WALLET_ADDRESS: b }), b);
  assert.equal(resolveCheckinReceiverFromEnv({}), "");
});

test("hasCheckinTreasury — false with no env configured", () => {
  assert.equal(hasCheckinTreasury(), false);
});

test("parseOptionalChainIdFromBody — parses valid, null for invalid/absent", () => {
  assert.equal(parseOptionalChainIdFromBody({ chainId: 137 }), 137);
  assert.equal(parseOptionalChainIdFromBody({ chainId: "137" }), 137);
  assert.equal(parseOptionalChainIdFromBody({}), null);
  assert.equal(parseOptionalChainIdFromBody({ chainId: -1 }), null);
});

test("evaluateCheckinPayment — missing on-chain tx stays pending (never fabricates confirmed)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  try {
    const result = await evaluateCheckinPayment({
      txHash: "0x" + "a".repeat(64),
      userWalletLower: "0x" + "1".repeat(40),
      receiverLower: "0x" + "2".repeat(40),
      minValueWei: 1n,
    });
    assert.equal(result.state, "pending");
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
