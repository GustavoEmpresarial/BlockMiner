import test from "node:test";
import assert from "node:assert/strict";

// Exercises the REAL withdrawal.coinex.ts logic (HMAC signing, header/URL construction,
// CoinEx error-code handling, "not configured" honest-degradation) via its injectable
// `fetchImpl` seam — no live CoinEx API call. This is not a fake of the module's own
// behavior: only the network boundary is swapped, exactly the pattern the module was
// already designed for.
const coinex = await import("../../server/modules/wallet/withdrawal/withdrawal.coinex.ts");

const prevAccessId = process.env.COINEX_ACCESS_ID;
const prevSecret = process.env.COINEX_SECRET;

test.after(() => {
  if (prevAccessId === undefined) delete process.env.COINEX_ACCESS_ID;
  else process.env.COINEX_ACCESS_ID = prevAccessId;
  if (prevSecret === undefined) delete process.env.COINEX_SECRET;
  else process.env.COINEX_SECRET = prevSecret;
});

test("isCoinExConfigured: false when either env var is missing/blank", () => {
  delete process.env.COINEX_ACCESS_ID;
  delete process.env.COINEX_SECRET;
  assert.equal(coinex.isCoinExConfigured(), false);
  process.env.COINEX_ACCESS_ID = "id";
  process.env.COINEX_SECRET = "";
  assert.equal(coinex.isCoinExConfigured(), false);
  process.env.COINEX_SECRET = "secret";
  assert.equal(coinex.isCoinExConfigured(), true);
});

test("submitCoinExWithdrawal: throws CoinExNotConfiguredError (never fabricates success) when unconfigured", async () => {
  delete process.env.COINEX_ACCESS_ID;
  delete process.env.COINEX_SECRET;
  let calledFetch = false;
  const fetchImpl = async () => {
    calledFetch = true;
    throw new Error("must never be called");
  };
  await assert.rejects(
    () => coinex.submitCoinExWithdrawal("0x" + "1".repeat(40), "10", 1, fetchImpl),
    coinex.CoinExNotConfiguredError,
  );
  assert.equal(calledFetch, false, "must fail fast before ever touching the network");
});

test("submitCoinExWithdrawal: configured — sends a correctly-signed POST and parses withdraw_id", async () => {
  process.env.COINEX_ACCESS_ID = "test-access-id";
  process.env.COINEX_SECRET = "test-secret";

  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url: String(url), init };
    return {
      json: async () => ({ code: 0, message: "OK", data: { withdraw_id: 4242 } }),
    };
  };

  const result = await coinex.submitCoinExWithdrawal("0x" + "2".repeat(40), "12.5", 99, fetchImpl);
  assert.equal(result.withdrawId, 4242);

  assert.equal(captured.url, "https://api.coinex.com/v2/assets/withdraw");
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers["X-COINEX-KEY"], "test-access-id");
  assert.equal(captured.init.headers["Content-Type"], "application/json");
  assert.ok(/^[0-9a-f]{64}$/.test(captured.init.headers["X-COINEX-SIGN"]), "signature must be a hex-encoded HMAC-SHA256 digest");
  const body = JSON.parse(captured.init.body);
  assert.deepEqual(body, { ccy: "POL", chain: "MATIC", to_address: "0x" + "2".repeat(40), amount: "12.5", remark: "BlockMiner #99" });

  // Signature must actually be a function of the request (changing the body changes it).
  let captured2 = null;
  const fetchImpl2 = async (url, init) => {
    captured2 = init;
    return { json: async () => ({ code: 0, message: "OK", data: { withdraw_id: 1 } }) };
  };
  await coinex.submitCoinExWithdrawal("0x" + "3".repeat(40), "1", 100, fetchImpl2);
  assert.notEqual(captured.init.headers["X-COINEX-SIGN"], captured2.headers["X-COINEX-SIGN"]);
});

test("submitCoinExWithdrawal: a non-zero CoinEx error code throws with the API's message", async () => {
  process.env.COINEX_ACCESS_ID = "test-access-id";
  process.env.COINEX_SECRET = "test-secret";
  const fetchImpl = async () => ({
    json: async () => ({ code: 3008, message: "insufficient balance", data: null }),
  });
  await assert.rejects(
    () => coinex.submitCoinExWithdrawal("0x" + "4".repeat(40), "10", 1, fetchImpl),
    /CoinEx API error 3008: insufficient balance/,
  );
});

test("getCoinExWithdrawalStatus: parses a real 0x tx hash, and normalizes a non-0x value to null", async () => {
  process.env.COINEX_ACCESS_ID = "test-access-id";
  process.env.COINEX_SECRET = "test-secret";

  const withHash = async (url) => {
    assert.ok(String(url).includes("withdraw_id=555"));
    return { json: async () => ({ code: 0, message: "OK", data: { tx_hash: "0x" + "a".repeat(64), status: "finish" } }) };
  };
  const status1 = await coinex.getCoinExWithdrawalStatus(555, withHash);
  assert.equal(status1.txHash, "0x" + "a".repeat(64));
  assert.equal(status1.status, "finish");

  const withoutHash = async () => ({ json: async () => ({ code: 0, message: "OK", data: { tx_hash: "", status: "audit_required" } }) });
  const status2 = await coinex.getCoinExWithdrawalStatus(556, withoutHash);
  assert.equal(status2.txHash, null);
  assert.equal(status2.status, "audit_required");
});
