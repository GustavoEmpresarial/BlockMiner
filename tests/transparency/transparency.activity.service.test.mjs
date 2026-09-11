import test from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";

const svc = await import("../../server/modules/transparency/transparency.activity.service.ts");

const ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";

function fakeProvider({ balanceWei, blockNumber, fail } = {}) {
  return {
    async getBalance() {
      if (fail) throw new Error("rpc down");
      return balanceWei ?? 0n;
    },
    async getBlockNumber() {
      if (fail) throw new Error("rpc down");
      return blockNumber ?? 0;
    },
  };
}

test("polygonscanApiKeyConfigured is false when env var is unset/blank", () => {
  const prev = process.env.POLYGONSCAN_API_KEY;
  delete process.env.POLYGONSCAN_API_KEY;
  assert.equal(svc.polygonscanApiKeyConfigured(), false);
  process.env.POLYGONSCAN_API_KEY = "   ";
  assert.equal(svc.polygonscanApiKeyConfigured(), false);
  if (prev === undefined) delete process.env.POLYGONSCAN_API_KEY;
  else process.env.POLYGONSCAN_API_KEY = prev;
});

test("polygonscanApiKeyConfigured is true when env var has a non-blank value", () => {
  const prev = process.env.POLYGONSCAN_API_KEY;
  process.env.POLYGONSCAN_API_KEY = "some-key";
  assert.equal(svc.polygonscanApiKeyConfigured(), true);
  if (prev === undefined) delete process.env.POLYGONSCAN_API_KEY;
  else process.env.POLYGONSCAN_API_KEY = prev;
});

test("fetchWalletNativeActivity makes a real RPC attempt and returns live balance/block honestly, with apiKeyConfigured:false when no key is set", async () => {
  const prev = process.env.POLYGONSCAN_API_KEY;
  delete process.env.POLYGONSCAN_API_KEY;

  const provider = fakeProvider({ balanceWei: ethers.parseEther("3.5"), blockNumber: 12345 });
  const result = await svc.fetchWalletNativeActivity(ADDRESS, { provider });

  assert.equal(result.address, ADDRESS);
  assert.equal(result.apiKeyConfigured, false);
  assert.equal(result.balancePol, 3.5);
  assert.equal(result.blockNumber, 12345);
  assert.equal(result.error, null);
  assert.match(result.note, /not configured/);
  assert.deepEqual(result.movements, []);
  assert.equal(result.summary.movementCount, 0);
  assert.equal(result.summary.totalInPol, null);

  if (prev === undefined) delete process.env.POLYGONSCAN_API_KEY;
  else process.env.POLYGONSCAN_API_KEY = prev;
});

test("fetchWalletNativeActivity degrades honestly (no fabricated data) when the RPC call fails", async () => {
  const provider = fakeProvider({ fail: true });
  const result = await svc.fetchWalletNativeActivity(ADDRESS, { provider });

  assert.equal(result.balancePol, null);
  assert.equal(result.blockNumber, null);
  assert.equal(result.error, "provider_error");
  assert.deepEqual(result.movements, []);
});

test("fetchWalletNativeActivity reports apiKeyConfigured:true (still no fabricated movement history) when a key IS set", async () => {
  const prev = process.env.POLYGONSCAN_API_KEY;
  process.env.POLYGONSCAN_API_KEY = "test-key";

  const provider = fakeProvider({ balanceWei: 0n, blockNumber: 1 });
  const result = await svc.fetchWalletNativeActivity(ADDRESS, { provider });

  assert.equal(result.apiKeyConfigured, true);
  assert.deepEqual(result.movements, []);
  assert.match(result.note, /not ported/);

  if (prev === undefined) delete process.env.POLYGONSCAN_API_KEY;
  else process.env.POLYGONSCAN_API_KEY = prev;
});
