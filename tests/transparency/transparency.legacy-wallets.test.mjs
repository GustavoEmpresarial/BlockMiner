import test from "node:test";
import assert from "node:assert/strict";

const legacy = await import("../../server/modules/transparency/transparency.legacy-wallets.ts");

test("normalizeLegacyWalletFlags marks known legacy addresses inactive", () => {
  const oldDeposit = legacy.normalizeLegacyWalletFlags({
    address: legacy.OLD_DEPOSIT_WALLET_ADDRESS,
    isActive: true,
    includeInTotals: true,
  });
  assert.equal(oldDeposit.isActive, false);
  assert.equal(oldDeposit.includeInTotals, false);

  const active = legacy.normalizeLegacyWalletFlags({
    address: "0x9DA76e0000000000000000000000000000000000",
    isActive: true,
    includeInTotals: true,
  });
  assert.equal(active.isActive, true);
  assert.equal(active.includeInTotals, true);
});
